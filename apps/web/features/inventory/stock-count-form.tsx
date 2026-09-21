"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { StockCountCreate } from "@aabhushan/contracts";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Skeleton, TableSkeleton } from "@/components/application/skeleton/skeleton";
import { StaffBackLink } from "@/components/application/staff-back-link";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { SelectField } from "@/components/shared/select-field";
import { TextArea } from "@/components/base/textarea/textarea";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  articleStatusColor,
  articleStatusLabel,
  inventoryAccessToken,
  inventoryErrorMessage,
} from "@/features/inventory/inventory-shared";
import { createStockCountRequest, fetchArticles } from "@/lib/staff-api";

type CountedStatus = StockCountCreate["lines"][number]["counted_status"];

export function StockCountForm() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "inventory.write");
  const [countedOn, setCountedOn] = useState<CalendarDate | null>(null);
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<string, CountedStatus>>({});
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const articles = useQuery({
    queryKey: ["inventory", "articles", "count-source", staff.membership.organization_id],
    queryFn: async () => fetchArticles(await inventoryAccessToken(), { page: 1, pageSize: 100 }),
    enabled: allowed,
  });

  useEffect(() => {
    if (articles.data) {
      setCounts((current) => {
        const next = { ...current };
        for (const item of articles.data.items) {
          if (!next[item.id]) {
            next[item.id] = item.status === "unavailable" ? "unavailable" : "available";
          }
        }
        return next;
      });
    }
  }, [articles.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const items = articles.data?.items ?? [];
      if (!countedOn) {
        throw new Error("Choose the count business date.");
      }
      return createStockCountRequest(await inventoryAccessToken(), {
        counted_on: countedOn.toString(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: items.map((item) => ({
          article_id: item.id,
          counted_status: counts[item.id] ?? "available",
        })),
      });
    },
    onSuccess: (count) => {
      const discrepancies = count.lines.filter((line) => line.has_discrepancy).length;
      setResultMessage(
        `Count ${count.id} saved as reviewed. ${String(discrepancies)} discrepancy ${discrepancies === 1 ? "line" : "lines"} wrote adjustments. Sold and under-review pieces were not flipped silently.`,
      );
    },
  });

  if (!allowed) {
    return null;
  }

  const items = articles.data?.items ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <StaffBackLink href="/inventory" label="Inventory" />
        <h1 className="text-display-xs font-semibold text-primary">Physical stock count</h1>
        <p className="text-md text-tertiary">
          Reviewed counts only. Discrepancies create adjustment movements; they do not silently change sold or inspection pieces.
        </p>
      </div>

      {articles.isLoading ? (
        <>
          <TableSkeleton columns={3} rows={8} titleWidth="w-28" label="Loading articles to count" />
          <div className="flex flex-wrap gap-3" aria-hidden="true">
            <Skeleton className="h-10 w-44 rounded-lg" />
          </div>
        </>
      ) : null}

      {!articles.isLoading && items.length === 0 ? (
        <EmptyState size="md">
          <EmptyState.Header pattern="none">
            <EmptyState.Content>
              <EmptyState.Title>Nothing to count</EmptyState.Title>
              <EmptyState.Description>Receive articles before recording a physical count.</EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
          <EmptyState.Footer>
            <Button color="primary" size="md" href="/inventory/receive">
              Receive article
            </Button>
          </EmptyState.Footer>
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setResultMessage(null);
            mutation.mutate();
          }}
        >
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-secondary">Counted on</p>
              <DatePicker
                value={countedOn}
                onChange={(value) => setCountedOn(value ? parseDate(value.toString()) : null)}
                aria-label="Counted on"
              />
            </div>
            <TextArea label="Notes" value={notes} onChange={setNotes} />
          </div>

          <TableCard.Root>
            <TableCard.Header title="Count lines" description="Mark missing pieces as missing. That records a discrepancy and, for available stock, an adjustment to unavailable." />
            <Table aria-label="Stock count lines">
              <Table.Header>
                <Table.Head id="article" isRowHeader label="Article" />
                <Table.Head id="expected" label="System status" />
                <Table.Head id="counted" label="Counted as" />
              </Table.Header>
              <Table.Body items={items}>
                {(item) => (
                  <Table.Row id={item.id}>
                    <Table.Cell>
                      <span className="font-mono">{item.article_number}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={articleStatusColor(item.status)} size="sm">
                        {articleStatusLabel(item.status)}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <SelectField
                        aria-label={`Counted status for ${item.article_number}`}
                        value={counts[item.id] ?? "available"}
                        onChange={(value) =>
                          setCounts((current) => ({ ...current, [item.id]: value as CountedStatus }))
                        }
                        options={[
                          { label: "Available", value: "available" },
                          { label: "Unavailable", value: "unavailable" },
                          { label: "Missing", value: "missing" },
                        ]}
                      />
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </TableCard.Root>

          {mutation.isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(mutation.error)}</p> : null}
          {resultMessage ? <p className="text-sm text-success-primary">{resultMessage}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
              Save reviewed count
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
