"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { girviAccessToken, girviErrorMessage } from "@/features/girvi/girvi-shared";

export function GirviAckDocumentsCard({ accountId }: { accountId: string }) {
  return (
    <DocumentStatusCard
      title="Release acknowledgement"
      description="PDF is generated after physical release. Download when ready; a failure never undoes the release."
      ownerType="girvi"
      ownerId={accountId}
      documentType="girvi_ack_pdf"
      accessToken={girviAccessToken}
      errorMessage={girviErrorMessage}
      queryKeyPrefix="girvi-ack"
    />
  );
}
