"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Document, DocumentStatus } from "@aabhushan/contracts";
import { currentTemplateVersionFor } from "@aabhushan/contracts";

import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useStaff } from "@/features/auth/staff-shell";
import { paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";
import { fetchOwnerDocuments, retryDocumentRequest } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

function statusLabel(status: DocumentStatus): string {
  if (status === "pending") {
    return "Pending";
  }
  if (status === "ready") {
    return "Ready";
  }
  return "PDF failed";
}

function statusColor(status: DocumentStatus): "gray" | "success" | "error" {
  if (status === "ready") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  return "gray";
}

function isOutdatedReady(document: Document): boolean {
  return (
    document.status === "ready" &&
    document.template_version !== currentTemplateVersionFor(document.document_type)
  );
}

/** Slim single-row receipt PDF status for the payment detail dialog. */
export function ReceiptDocumentsCard({ paymentId }: { paymentId: string }) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["documents", "receipt", staff.membership.organization_id, paymentId, "receipt_pdf"],
    queryFn: async () =>
      fetchOwnerDocuments(await paymentAccessToken(), { ownerType: "receipt", ownerId: paymentId }),
  });

  const retry = useMutation({
    mutationFn: async (documentId: string) => retryDocumentRequest(await paymentAccessToken(), documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["documents", "receipt", staff.membership.organization_id, paymentId],
      });
    },
  });

  const document: Document | null =
    query.data?.items.find((item) => item.document_type === "receipt_pdf") ?? query.data?.items[0] ?? null;
  const status: DocumentStatus = document?.status ?? "pending";
  const failed = status === "failed";
  const canRetry = document != null && (failed || isOutdatedReady(document));

  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ring-1",
        failed ? "bg-error-primary ring-error-secondary" : "bg-secondary ring-secondary",
      )}
    >
      <Badge color={statusColor(status)} size="sm">
        {statusLabel(status)}
        {document && isOutdatedReady(document) ? " · old layout" : ""}
      </Badge>
      <p className="min-w-0 flex-1 text-sm text-secondary">
        {failed
          ? "The payment is saved; only the PDF didn't build."
          : status === "ready"
            ? "Receipt PDF is ready."
            : "PDF is prepared after the payment is saved."}
      </p>
      {query.isError ? (
        <p className="w-full text-sm text-error-primary" role="alert">
          {paymentErrorMessage(query.error)}
        </p>
      ) : null}
      {canRetry ? (
        <Button
          color="link-color"
          size="sm"
          className="ml-auto shrink-0 px-0"
          isDisabled={retry.isPending}
          onPress={() => {
            if (document) {
              retry.mutate(document.id);
            }
          }}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
