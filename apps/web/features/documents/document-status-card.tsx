"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Document, DocumentStatus } from "@aabhushan/contracts";
import { currentTemplateVersionFor } from "@aabhushan/contracts";

import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { useStaff } from "@/features/auth/staff-shell";
import { fetchOwnerDocuments, retryDocumentRequest } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

function statusLabel(status: DocumentStatus): string {
  if (status === "pending") {
    return "Pending";
  }
  if (status === "ready") {
    return "Ready";
  }
  return "Failed";
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
  /** When set, shows a labelled status row (e.g. Invoice PDF) instead of badge-on-title. */
  documentLabel,
  /** Mid-aged counter comfort: larger type, pads, and lg actions (invoice detail). */
  density = "default",
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
  documentLabel?: string;
  density?: "default" | "comfort";
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const comfort = density === "comfort";
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

  const badgeSize = comfort ? "lg" : "sm";
  const actionSize = comfort ? "lg" : "sm";

  const statusBadge = document ? (
    <Badge color={statusColor(document.status)} size={badgeSize}>
      {statusLabel(document.status)}
      {isOutdatedReady(document) ? " · old layout" : ""}
    </Badge>
  ) : (
    <Badge color="gray" size={badgeSize}>
      Pending
    </Badge>
  );

  return (
    <div
      className={cx(
        "flex flex-col overflow-hidden rounded-xl bg-primary ring-1 ring-secondary",
        documentLabel ? "" : "gap-3 p-4 ring-inset",
      )}
    >
      {documentLabel ? (
        <>
          <div className={cx("border-b border-secondary", comfort ? "px-5 py-3.5" : "px-3 py-2")}>
            <h2
              className={cx(
                "font-semibold tracking-wide text-secondary uppercase",
                comfort ? "text-sm" : "text-[10px]",
              )}
            >
              {title}
            </h2>
          </div>
          <div className={cx("flex flex-col", comfort ? "gap-2.5 px-5 py-4" : "gap-2 px-3 py-2.5")}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-primary">{documentLabel}</span>
              {statusBadge}
            </div>
            <p className={cx("leading-snug text-tertiary", comfort ? "text-sm" : "text-xs")}>
              {description}
            </p>
            {query.isError ? (
              <p className="text-sm text-error-primary" role="alert">
                {errorMessage(query.error)}
              </p>
            ) : null}
            {document?.status === "failed" && document.last_error_code ? (
              <p className={cx("text-tertiary", comfort ? "text-sm" : "text-xs")}>
                Details: {document.last_error_code}
              </p>
            ) : null}
            {document && isOutdatedReady(document) ? (
              <p className={cx("text-tertiary", comfort ? "text-sm" : "text-xs")}>
                Paper size or layout changed. Create the PDF again.
              </p>
            ) : null}
          </div>
          <div
            className={cx(
              "mt-auto flex flex-col border-t border-secondary",
              comfort ? "gap-2.5 px-5 py-4" : "gap-2 px-3 py-2.5",
            )}
          >
            {printHref ? (
              <Button
                color="secondary"
                size={actionSize}
                className="w-full"
                href={printHref}
                target="_blank"
              >
                Preview & print
              </Button>
            ) : null}
            {document?.status === "ready" && document.download_url ? (
              <Button
                color="link-gray"
                size={actionSize}
                className="w-full justify-start px-0"
                href={document.download_url}
                target="_blank"
              >
                Download PDF
              </Button>
            ) : null}
            {canRegenerate ? (
              <Button
                color="link-color"
                size={actionSize}
                className="w-full justify-start px-0"
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
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            {statusBadge}
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
        </>
      )}
    </div>
  );
}
