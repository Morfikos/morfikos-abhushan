"use client";

import { useEffect, useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseDate } from "@internationalized/date";
import { Scale01 } from "@untitledui/icons";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import {
  GirviDetailSkeleton,
  MetricTilesSkeleton,
  TableSkeleton,
} from "@/components/application/skeleton/skeleton";
import { Tabs } from "@/components/application/tabs/tabs";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { GirviAckDocumentsCard } from "@/features/girvi/girvi-ack-documents-card";
import { GirviMovePacketDialog } from "@/features/girvi/girvi-move-packet-dialog";
import { GirviReleaseDialog } from "@/features/girvi/girvi-release-dialog";
import { GirviRepaymentDialog } from "@/features/girvi/girvi-repayment-dialog";
import { GirviSettleDialog } from "@/features/girvi/girvi-settle-dialog";
import {
  GIRVI_RATE_PERIOD_LABEL,
  girviAccessToken,
  girviErrorMessage,
  girviOverdueHint,
  girviStatusBadgeColor,
  girviStatusLabel,
  girviToday,
} from "@/features/girvi/girvi-shared";
import { MoneyText } from "@/components/shared/money-text";
import { paymentMethodLabel } from "@/lib/payment-methods";
import {
  activateGirviAccountRequest,
  discardGirviDraftRequest,
  fetchGirviAccount,
  fetchGirviCollateralFileView,
  fetchGirviStatement,
} from "@/lib/staff-api";
import { uploadStaffFile } from "@/lib/staff-file-upload";

const MONEY_EVENT_LABELS: Record<string, string> = {
  disbursement: "Disbursement",
  opening_balance: "Opening balance",
  interest_accrual: "Interest accrual",
  interest_recognized: "Interest recognized",
  repayment: "Repayment",
  settlement: "Settlement",
  waiver: "Waiver",
};

/** Ledger deltas are signed; screens show the money the customer paid or received. */
function absoluteMoney(amount: string): string {
  return amount.startsWith("-") ? amount.slice(1) : amount;
}

export function GirviDetail() {
  const staff = useStaff();
  const router = useRouter();
  const params = useParams<{ accountId: string }>();
  const accountId = params.accountId;
  const allowed = staffHasPermission(staff, "girvi.write");
  const canRelease = staffHasPermission(staff, "girvi.release");
  const canWaive = staff.membership.role === "owner" || staff.membership.role === "admin";
  const queryClient = useQueryClient();
  const [activateOpen, setActivateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [moveItemId, setMoveItemId] = useState<string | null>(null);
  const [statementAsOf, setStatementAsOf] = useState(girviToday());
  const [actionError, setActionError] = useState<string | null>(null);
  const idempotencyKeyRef = useId();

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const query = useQuery({
    queryKey: ["girvi-account", staff.membership.organization_id, accountId],
    queryFn: async () => fetchGirviAccount(await girviAccessToken(), accountId),
    enabled: allowed && Boolean(accountId),
  });

  const statementQuery = useQuery({
    queryKey: ["girvi-statement", staff.membership.organization_id, accountId, statementAsOf],
    queryFn: async () => fetchGirviStatement(await girviAccessToken(), accountId, statementAsOf),
    enabled: allowed && Boolean(accountId) && query.data?.status !== "draft",
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const account = query.data;
      if (!account) {
        throw new Error("Account not loaded.");
      }
      return activateGirviAccountRequest(
        await girviAccessToken(),
        account.id,
        {
          row_version: account.row_version,
          confirm_principal_inr: account.principal_inr,
          confirm_packet_numbers: account.collateral.map((item) => item.packet_number),
        },
        `girvi-activate-${account.id}-${idempotencyKeyRef}`,
      );
    },
    onSuccess: async (account) => {
      setActivateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["girvi-account", staff.membership.organization_id, account.id] });
      await queryClient.invalidateQueries({ queryKey: ["girvi-accounts", staff.membership.organization_id] });
    },
    onError: (error) => {
      setActionError(girviErrorMessage(error));
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      const account = query.data;
      if (!account) {
        throw new Error("Account not loaded.");
      }
      await discardGirviDraftRequest(await girviAccessToken(), account.id, account.row_version);
    },
    onSuccess: async () => {
      setDiscardOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["girvi-accounts", staff.membership.organization_id] });
      router.push("/girvi");
    },
    onError: (error) => {
      setActionError(girviErrorMessage(error));
    },
  });

  if (!allowed) {
    return null;
  }

  if (query.isLoading) {
    return <GirviDetailSkeleton label="Loading Girvi account" />;
  }

  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {girviErrorMessage(query.error ?? new Error("Not found"))}
      </p>
    );
  }

  const account = query.data;
  const overdueHint = girviOverdueHint(account.is_overdue);
  const draftRate = account.terms_snapshot.interest.rate_percent_per_30_days;
  const draftMissingRate =
    account.status === "draft" &&
    (draftRate === null || draftRate.trim() === "" || Number.parseFloat(draftRate) <= 0);
  const moneyEvents = account.financial_events.filter(
    (event) => event.event_type === "repayment" || event.event_type === "settlement" || event.event_type === "waiver",
  );

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        back={{ label: "Girvi", href: "/girvi" }}
        icon={Scale01}
        title={account.account_number}
        badge={
          <Badge color={girviStatusBadgeColor(account.status, account.is_overdue)} size="sm">
            {girviStatusLabel(account.status, account.is_overdue)}
          </Badge>
        }
        description={
          <>
            {account.customer_display_name} · Principal{" "}
            <MoneyText amount={account.principal_inr} className="text-primary" />
            {account.status !== "draft" ? (
              <>
                {" · Outstanding principal "}
                <MoneyText amount={account.principal_outstanding_inr} className="text-primary" />
                {" · Unpaid interest "}
                <MoneyText amount={account.interest_outstanding_inr} className="text-primary" />
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {account.status === "draft" ? (
              <>
                <Button color="secondary" size="md" href={`/girvi/${account.id}/edit`}>
                  Edit draft
                </Button>
                <Button color="secondary-destructive" size="md" onPress={() => setDiscardOpen(true)}>
                  Discard draft
                </Button>
                <Button
                  color="primary"
                  size="md"
                  isDisabled={draftMissingRate}
                  onPress={() => setActivateOpen(true)}
                >
                  Activate account
                </Button>
              </>
            ) : null}
            {account.status === "active" ? (
              <>
                <Button color="secondary" size="md" onPress={() => setRepaymentOpen(true)}>
                  Record repayment
                </Button>
                <Button color="primary" size="md" onPress={() => setSettleOpen(true)}>
                  Settle account
                </Button>
              </>
            ) : null}
            {account.status === "settled" && canRelease ? (
              <Button color="primary" size="md" onPress={() => setReleaseOpen(true)}>
                Release collateral
              </Button>
            ) : null}
          </>
        }
      />

      {overdueHint ? <p className="text-sm text-warning-primary">{overdueHint}</p> : null}

      {account.status === "settled" ? (
        <p className="text-sm text-tertiary">
          Settled financially. The packets are still in the shop and remain the customer&apos;s jewellery until a
          release is recorded.
        </p>
      ) : null}

      {account.status === "released" ? <GirviAckDocumentsCard accountId={account.id} /> : null}

      {draftMissingRate ? (
        <p className="text-sm text-tertiary">
          Enter an interest rate (% per 30 days) on{" "}
          <Button color="link-color" size="sm" className="inline px-0" href={`/girvi/${account.id}/edit`}>
            Edit draft
          </Button>{" "}
          before activating. Without a rate, statements and settlement stay blocked.
        </p>
      ) : null}

      {actionError ? (
        <p className="text-sm text-error-primary" role="alert">
          {actionError}
        </p>
      ) : null}

      <Tabs defaultSelectedKey="collateral" className="gap-6">
        <Tabs.List type="underline" size="md">
          <Tabs.Item id="collateral" label="Collateral" />
          <Tabs.Item id="terms" label="Terms" />
          <Tabs.Item id="statement" label="Statement" />
          <Tabs.Item id="payments" label="Payments" />
          <Tabs.Item id="history" label="History" />
        </Tabs.List>

        <Tabs.Panel id="collateral">
          <TableCard.Root>
            <TableCard.Header title="Collateral packets" badge={String(account.collateral.length)} />
            <Table aria-label="Collateral items">
              <Table.Header>
                <Table.Head id="desc" label="Description" isRowHeader />
                <Table.Head id="packet" label="Packet" />
                <Table.Head id="location" label="Location" />
                <Table.Head id="weights" label="Weights" />
                <Table.Head id="value" label="Assessed" className="text-right" />
                <Table.Head id="status" label="Status" />
                <Table.Head id="actions" label="" />
              </Table.Header>
              <Table.Body items={account.collateral}>
                {(item) => (
                  <Table.Row id={item.id}>
                    <Table.Cell className="font-medium text-primary">
                      <span
                        title={[
                          [item.metal, item.purity].filter(Boolean).join(" · ") || "—",
                          item.files.length === 0
                            ? "No photos"
                            : `${item.files.length} photo${item.files.length === 1 ? "" : "s"}`,
                        ].join(" · ")}
                      >
                        {item.description}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-sm">{item.packet_number}</Table.Cell>
                    <Table.Cell>{item.custody_location}</Table.Cell>
                    <Table.Cell className="tabular-nums text-sm">
                      {item.gross_weight_grams ? `${item.gross_weight_grams} g` : "—"}
                      {item.net_metal_weight_grams ? ` / net ${item.net_metal_weight_grams} g` : ""}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {item.assessed_value_inr ? (
                        <MoneyText amount={item.assessed_value_inr} className="text-right" />
                      ) : (
                        "—"
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color="gray" size="sm">
                        {item.status === "in_custody" ? "In custody" : "Released"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell truncate={false}>
                      <div className="flex items-center gap-2">
                        {item.status === "in_custody" &&
                        (account.status === "active" || account.status === "settled") ? (
                          <Button color="link-color" size="sm" className="px-0" onPress={() => setMoveItemId(item.id)}>
                            Move
                          </Button>
                        ) : null}
                        {account.status === "draft" ? (
                          <Button
                            color="link-color"
                            size="sm"
                            className="px-0"
                            onPress={() => {
                              const input = document.createElement("input");
                              input.type = "file";
                              input.accept = "image/jpeg,image/png,image/webp";
                              input.onchange = () => {
                                const file = input.files?.[0];
                                if (!file) {
                                  return;
                                }
                                setActionError(null);
                                void (async () => {
                                  try {
                                    await uploadStaffFile({
                                      accessToken: await girviAccessToken(),
                                      ownerType: "girvi_collateral",
                                      ownerId: item.id,
                                      file,
                                      purpose: "collateral_photo",
                                    });
                                    await queryClient.invalidateQueries({
                                      queryKey: ["girvi-account", staff.membership.organization_id, account.id],
                                    });
                                  } catch (error) {
                                    setActionError(girviErrorMessage(error));
                                  }
                                })();
                              };
                              input.click();
                            }}
                          >
                            Add photo
                          </Button>
                        ) : null}
                        {item.files[0] ? (
                          <Button
                            color="link-gray"
                            size="sm"
                            className="px-0"
                            onPress={() => {
                              setActionError(null);
                              void (async () => {
                                try {
                                  const view = await fetchGirviCollateralFileView(
                                    await girviAccessToken(),
                                    account.id,
                                    item.id,
                                    item.files[0]!.id,
                                  );
                                  window.open(view.signed_url, "_blank", "noopener,noreferrer");
                                } catch (error) {
                                  setActionError(girviErrorMessage(error));
                                }
                              })();
                            }}
                          >
                            View
                          </Button>
                        ) : null}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </TableCard.Root>
        </Tabs.Panel>

        <Tabs.Panel id="terms">
          <SectionCard title="Frozen terms snapshot" className="max-w-xl">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-tertiary">Principal</dt>
                <MoneyText
                  amount={account.terms_snapshot.principal_inr}
                  as="dd"
                  className="text-md font-medium text-primary"
                />
              </div>
              <div>
                <dt className="text-sm text-tertiary">Start</dt>
                <dd className="tabular-nums text-md text-primary">{account.terms_snapshot.start_business_date}</dd>
              </div>
              <div>
                <dt className="text-sm text-tertiary">Maturity</dt>
                <dd className="tabular-nums text-md text-primary">{account.terms_snapshot.maturity_business_date}</dd>
              </div>
              {account.terms_snapshot.interest.status === "approved" ? (
                <>
                  <div>
                    <dt className="text-sm text-tertiary">Rate</dt>
                    <dd className="tabular-nums text-md font-medium text-primary">
                      {account.terms_snapshot.interest.rate_percent_per_30_days}%{" "}
                      <span className="text-sm font-normal text-tertiary">{GIRVI_RATE_PERIOD_LABEL}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-tertiary">Policy</dt>
                    <dd className="text-md text-primary">{account.terms_snapshot.interest.policy_version}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-tertiary">Method</dt>
                    <dd className="text-sm text-secondary">{account.terms_snapshot.interest.method}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-tertiary">Day count</dt>
                    <dd className="text-sm text-secondary">{account.terms_snapshot.interest.day_count}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-tertiary">Allocation</dt>
                    <dd className="text-sm text-secondary">{account.terms_snapshot.interest.allocation_order}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-tertiary">Principal reduction</dt>
                    <dd className="text-sm text-secondary">{account.terms_snapshot.interest.principal_reduction}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-tertiary">No extra charges</dt>
                    <dd className="text-sm text-secondary">
                      {account.terms_snapshot.interest.minimum_period}. {account.terms_snapshot.interest.grace_period}.{" "}
                      {account.terms_snapshot.interest.extra_charges}.
                    </dd>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-tertiary">Interest</dt>
                  <dd className="text-sm text-secondary">{account.terms_snapshot.interest.message}</dd>
                </div>
              )}
            </dl>
            <p className="text-sm text-tertiary">
              Changing shop defaults later does not alter this snapshot. A 31-day period costs more than a 30-day
              period; calendar months are not equal-cost.
            </p>
          </SectionCard>
        </Tabs.Panel>

        <Tabs.Panel id="statement">
          {account.status === "draft" ? (
            <EmptyState size="sm" className="py-10">
              <EmptyState.Header pattern="none">
                <EmptyState.Content>
                  <p className="text-md font-semibold text-primary">Activate the account first</p>
                  <EmptyState.Description>
                    Interest starts on the start business date once principal is disbursed.
                  </EmptyState.Description>
                </EmptyState.Content>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-secondary">As of business date</span>
                  <DatePicker
                    value={parseDate(statementAsOf)}
                    aria-label="Statement as-of business date"
                    onChange={(value) => {
                      if (value) {
                        setStatementAsOf(value.toString());
                      }
                    }}
                  />
                </div>
                <p className="text-sm text-tertiary">
                  Viewing a statement never posts interest and never changes a balance.
                </p>
              </div>

              {statementQuery.isLoading ? (
                <div className="flex flex-col gap-6">
                  <MetricTilesSkeleton count={3} label="Calculating statement" />
                  <TableSkeleton columns={5} rows={4} titleWidth="w-36" label="Calculating statement" />
                </div>
              ) : null}
              {statementQuery.isError ? (
                <p className="text-sm text-error-primary" role="alert">
                  {girviErrorMessage(statementQuery.error)}
                </p>
              ) : null}

              {statementQuery.data ? (
                <div className="flex flex-col gap-6">
                  <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
                    <SectionCard className="gap-1 p-4 md:p-4">
                      <p className="text-sm text-tertiary">Principal outstanding</p>
                      <MoneyText
                        amount={statementQuery.data.principal_outstanding_inr}
                        as="p"
                        className="text-right text-display-xs font-semibold text-primary"
                      />
                    </SectionCard>
                    <SectionCard className="gap-1 p-4 md:p-4">
                      <p className="text-sm text-tertiary">Interest outstanding</p>
                      <MoneyText
                        amount={statementQuery.data.interest_outstanding_inr}
                        as="p"
                        className="text-right text-display-xs font-semibold text-primary"
                      />
                    </SectionCard>
                    <SectionCard className="gap-1 bg-secondary p-4 md:p-4">
                      <p className="text-sm text-tertiary">Settlement payable</p>
                      <MoneyText
                        amount={statementQuery.data.payoff_inr}
                        as="p"
                        className="text-right text-display-xs font-semibold text-primary"
                      />
                    </SectionCard>
                  </div>

                  <dl className="grid max-w-3xl gap-3 sm:grid-cols-2">
                    <div className="flex justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-sm ring-1 ring-secondary">
                      <dt className="text-tertiary">Principal recovered</dt>
                      <MoneyText amount={statementQuery.data.principal_recovered_inr} as="dd" className="text-primary" />
                    </div>
                    <div className="flex justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-sm ring-1 ring-secondary">
                      <dt className="text-tertiary">Interest received</dt>
                      <MoneyText amount={statementQuery.data.interest_received_inr} as="dd" className="text-primary" />
                    </div>
                  </dl>

                  <TableCard.Root>
                    <TableCard.Header
                      title="Interest accrual"
                      description={`${statementQuery.data.rate_percent_per_30_days}% ${GIRVI_RATE_PERIOD_LABEL} · simple interest on outstanding principal · ${statementQuery.data.policy_version}`}
                      badge={String(statementQuery.data.accrual_segments.length)}
                    />
                    {statementQuery.data.accrual_segments.length === 0 ? (
                      <p className="px-6 py-4 text-sm text-tertiary">
                        No days have elapsed yet. Same-day opening and settlement accrues nothing.
                      </p>
                    ) : (
                      <Table aria-label="Interest accrual segments">
                        <Table.Header>
                          <Table.Head id="from" label="From" isRowHeader />
                          <Table.Head id="to" label="To" />
                          <Table.Head id="days" label="Days" className="text-right" />
                          <Table.Head id="principal" label="Principal" className="text-right" />
                          <Table.Head id="interest" label="Interest" className="text-right" />
                        </Table.Header>
                        <Table.Body items={statementQuery.data.accrual_segments.map((segment, index) => ({
                          ...segment,
                          id: `${segment.from_business_date}-${String(index)}`,
                        }))}>
                          {(segment) => (
                            <Table.Row id={segment.id}>
                              <Table.Cell className="tabular-nums">{segment.from_business_date}</Table.Cell>
                              <Table.Cell className="tabular-nums">{segment.to_business_date}</Table.Cell>
                              <Table.Cell className="text-right tabular-nums">{segment.days}</Table.Cell>
                              <Table.Cell className="text-right">
                                <MoneyText amount={segment.principal_inr} className="text-right" />
                              </Table.Cell>
                              <Table.Cell className="text-right">
                                <MoneyText amount={segment.interest_inr} className="text-right" />
                              </Table.Cell>
                            </Table.Row>
                          )}
                        </Table.Body>
                      </Table>
                    )}
                  </TableCard.Root>
                </div>
              ) : null}
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="payments">
          {moneyEvents.length === 0 ? (
            <EmptyState size="sm" className="py-10">
              <EmptyState.Header pattern="none">
                <EmptyState.Content>
                  <p className="text-md font-semibold text-primary">No repayments yet</p>
                  <EmptyState.Description>
                    Disbursement is recorded under History. Repayments show the interest and principal parts
                    separately.
                  </EmptyState.Description>
                </EmptyState.Content>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <TableCard.Root>
              <TableCard.Header title="Repayments and settlement" badge={String(moneyEvents.length)} />
              <Table aria-label="Repayments">
                <Table.Header>
                  <Table.Head id="date" label="Business date" isRowHeader />
                  <Table.Head id="type" label="Type" />
                  <Table.Head id="method" label="Method" />
                  <Table.Head id="amount" label="Amount" className="text-right" />
                  <Table.Head id="interest" label="Interest" className="text-right" />
                  <Table.Head id="principal" label="Principal" className="text-right" />
                </Table.Header>
                <Table.Body items={moneyEvents}>
                  {(event) => (
                    <Table.Row id={event.id}>
                      <Table.Cell className="tabular-nums">{event.effective_business_date}</Table.Cell>
                      <Table.Cell>{MONEY_EVENT_LABELS[event.event_type] ?? event.event_type}</Table.Cell>
                      <Table.Cell>{event.method ? paymentMethodLabel(event.method) : "—"}</Table.Cell>
                      <Table.Cell className="text-right">
                        <MoneyText amount={event.amount_inr} className="text-right" />
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <MoneyText amount={absoluteMoney(event.interest_delta_inr)} className="text-right" />
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <MoneyText amount={absoluteMoney(event.principal_delta_inr)} className="text-right" />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </TableCard.Root>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="history">
          <div className="flex flex-col gap-6">
            <TableCard.Root>
              <TableCard.Header title="Financial events" badge={String(account.financial_events.length)} />
              {account.financial_events.length === 0 ? (
                <p className="px-6 py-4 text-sm text-tertiary">No disbursement yet. Activate the draft to record principal out.</p>
              ) : (
                <Table aria-label="Financial events">
                  <Table.Header>
                    <Table.Head id="type" label="Type" isRowHeader />
                    <Table.Head id="date" label="Business date" />
                    <Table.Head id="amount" label="Amount" className="text-right" />
                  </Table.Header>
                  <Table.Body items={account.financial_events}>
                    {(event) => (
                      <Table.Row id={event.id}>
                        <Table.Cell className="capitalize">{event.event_type.replaceAll("_", " ")}</Table.Cell>
                        <Table.Cell className="tabular-nums">{event.effective_business_date}</Table.Cell>
                        <Table.Cell className="text-right">
                          <MoneyText amount={event.amount_inr} className="text-right" />
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table>
              )}
            </TableCard.Root>

            <TableCard.Root>
              <TableCard.Header title="Custody events" badge={String(account.custody_events.length)} />
              {account.custody_events.length === 0 ? (
                <p className="px-6 py-4 text-sm text-tertiary">Custody moves are recorded when the account is activated.</p>
              ) : (
                <Table aria-label="Custody events">
                  <Table.Header>
                    <Table.Head id="type" label="Event" isRowHeader />
                    <Table.Head id="packet" label="Packet" />
                    <Table.Head id="location" label="Location" />
                    <Table.Head id="when" label="When" />
                  </Table.Header>
                  <Table.Body items={account.custody_events}>
                    {(event) => (
                      <Table.Row id={event.id}>
                        <Table.Cell className="capitalize">{event.event_type.replaceAll("_", " ")}</Table.Cell>
                        <Table.Cell className="font-mono text-sm">{event.packet_number}</Table.Cell>
                        <Table.Cell>{event.custody_location ?? "—"}</Table.Cell>
                        <Table.Cell className="tabular-nums text-sm">
                          {new Date(event.occurred_at).toLocaleString("en-IN")}
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table>
              )}
            </TableCard.Root>

            {account.release_events.length > 0 ? (
              <TableCard.Root>
                <TableCard.Header
                  title="Release events"
                  description="Handing jewellery back is recorded separately from settling the money."
                  badge={String(account.release_events.length)}
                />
                <Table aria-label="Release events">
                  <Table.Header>
                    <Table.Head id="when" label="When" isRowHeader />
                    <Table.Head id="packets" label="Packets verified" />
                    <Table.Head id="recipient" label="Collected by" />
                    <Table.Head id="ack" label="Customer acknowledged" />
                  </Table.Header>
                  <Table.Body items={account.release_events}>
                    {(event) => (
                      <Table.Row id={event.id}>
                        <Table.Cell className="tabular-nums text-sm">
                          {new Date(event.created_at).toLocaleString("en-IN")}
                        </Table.Cell>
                        <Table.Cell className="font-mono text-sm">
                          {event.packet_numbers_verified.join(", ")}
                        </Table.Cell>
                        <Table.Cell>{event.recipient_name}</Table.Cell>
                        <Table.Cell>{event.customer_acknowledged ? "Yes" : "No"}</Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table>
              </TableCard.Root>
            ) : null}
          </div>
        </Tabs.Panel>
      </Tabs>

      <GirviRepaymentDialog isOpen={repaymentOpen} account={account} onClose={() => setRepaymentOpen(false)} />
      <GirviSettleDialog
        isOpen={settleOpen}
        account={account}
        canWaive={canWaive}
        onClose={() => setSettleOpen(false)}
      />
      <GirviReleaseDialog
        isOpen={releaseOpen}
        account={account}
        canWaive={canWaive}
        onClose={() => setReleaseOpen(false)}
      />
      <GirviMovePacketDialog
        isOpen={Boolean(moveItemId)}
        account={account}
        item={account.collateral.find((item) => item.id === moveItemId) ?? null}
        onClose={() => setMoveItemId(null)}
      />

      <ConfirmDialog
        isOpen={activateOpen}
        title="Activate Girvi account"
        confirmLabel="Activate and disburse"
        confirmColor="primary"
        cancelLabel="Cancel"
        isConfirming={activateMutation.isPending}
        onCancel={() => {
          if (!activateMutation.isPending) {
            setActivateOpen(false);
          }
        }}
        onConfirm={() => {
          setActionError(null);
          activateMutation.mutate();
        }}
        message={
          <div className="flex flex-col gap-2">
            <p>
              Customer <span className="font-medium text-primary">{account.customer_display_name}</span>
            </p>
            <p>
              Principal{" "}
              <MoneyText amount={account.principal_inr} className="font-medium text-primary" />
            </p>
            <p className="text-sm">
              Packets:{" "}
              <span className="font-mono text-primary">
                {account.collateral.map((item) => item.packet_number).join(", ")}
              </span>
            </p>
            <p className="text-sm text-tertiary">
              Records the cash handed over and takes the packets into shop custody. This is not a sale. Interest
              starts on the start business date using the rate on this account. Each collateral item needs at least
              one photo.
            </p>
          </div>
        }
      />

      <ConfirmDialog
        isOpen={discardOpen}
        title="Discard draft"
        confirmLabel="Discard draft"
        confirmColor="primary-destructive"
        cancelLabel="Keep draft"
        isConfirming={discardMutation.isPending}
        onCancel={() => {
          if (!discardMutation.isPending) {
            setDiscardOpen(false);
          }
        }}
        onConfirm={() => {
          setActionError(null);
          discardMutation.mutate();
        }}
        message={
          <p>
            Discard <span className="font-medium text-primary">{account.account_number}</span>? This removes the draft
            and any attached photos. Activated accounts cannot be discarded.
          </p>
        }
      />
    </section>
  );
}
