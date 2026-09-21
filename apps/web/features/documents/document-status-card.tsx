"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Document, DocumentStatus } from "@aabhushan/contracts";
import { currentTemplateVersionFor } from "@aabhushan/contracts";

import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useStaff } from "@/features/auth/staff-shell";
import { fetchOwnerDocuments, retryDocumentRequest } from "@/lib/staff-api";

function statusLabel(status: DocumentStatus): string {
  if (status === "pending") {
    return "Pending";
  }
  if (status === "ready") {
    return "Ready";
  }
  return "Failed";
}

function statusColor(status: DocumentStatus): "gray" | "success" | "warning" {
  if (status === "ready") {
    return "success";
  }
  if (status === "failed") {
    return "warning";
  }
  return "gray";
}

function isOutdatedReady(document: Document): boolean {
  return (
    document.status === "ready" &&
    document.template_version !== currentTemplateVersionFor(document.document_type)
  );
}

export function DocumentStatusCard({
  title,
  description,
  ownerType,
  ownerId,
  documentType,
  printHref,
  accessToken,
  errorMessage,
  queryKeyPrefix,
}: {
  title: string;
  description: string;
  ownerType: "invoice" | "receipt" | "girvi";
  ownerId: string;
  documentType?: Document["document_type"];
  printHref?: string;
  accessToken: () => Promise<string>;
  errorMessage: (error: unknown) => string;
  queryKeyPrefix: string;
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["documents", queryKeyPrefix, staff.membership.organization_id, ownerId, documentType ?? "any"],
    queryFn: async () => fetchOwnerDocuments(await accessToken(), { ownerType, ownerId }),
  });

  const retry = useMutation({
    mutationFn: async (documentId: string) => retryDocumentRequest(await accessToken(), documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["documents", queryKeyPrefix, staff.membership.organization_id, ownerId],
      });
    },
  });

  const document: Document | null =
    (documentType
      ? query.data?.items.find((item) => item.document_type === documentType)
      : query.data?.items[0]) ?? null;

  const canRegenerate =
    document != null && (document.status === "failed" || isOutdatedReady(document));
  const regenerateLabel =
    document?.status === "failed" ? "Try PDF again" : "Create PDF again";

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {document ? (
          <Badge color={statusColor(document.status)} size="sm">
            {statusLabel(document.status)}
            {isOutdatedReady(document) ? " · old layout" : ""}
          </Badge>
        ) : (
          <Badge color="gray" size="sm">
            Pending
          </Badge>
        )}
      </div>
      <p className="text-sm text-tertiary">{description}</p>
      {query.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {errorMessage(query.error)}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {printHref ? (
          <Button color="secondary" size="sm" className="w-full" href={printHref} target="_blank">
            Preview & print
          </Button>
        ) : null}
        {document?.status === "ready" && document.download_url ? (
          <Button color="secondary" size="sm" className="w-full" href={document.download_url} target="_blank">
            Download PDF
          </Button>
        ) : null}
        {canRegenerate ? (
          <Button
            color="primary"
            size="sm"
            className="w-full"
            isDisabled={retry.isPending}
            onPress={() => {
              if (document) {
                retry.mutate(document.id);
              }
            }}
          >
            {regenerateLabel}
          </Button>
        ) : null}
      </div>
      {document?.status === "failed" && document.last_error_code ? (
        <p className="text-xs text-tertiary">Details: {document.last_error_code}</p>
      ) : null}
      {document && isOutdatedReady(document) ? (
        <p className="text-xs text-tertiary">Paper size or layout changed. Create the PDF again.</p>
      ) : null}
    </div>
  );
}
