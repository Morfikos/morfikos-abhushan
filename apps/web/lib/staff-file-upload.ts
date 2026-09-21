import type { FileUploadGrantRequest, StoredObject, StoredObjectOwnerType } from "@aabhushan/contracts";
import { fileAccessSchema, fileUploadGrantResponseSchema, storedObjectSchema } from "@aabhushan/contracts";

import { StaffApiError, staffRequest } from "@/lib/staff-api";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function imageContentType(file: File): "image/jpeg" | "image/png" | "image/webp" {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") {
    return file.type;
  }
  throw new StaffApiError(400, "INVALID_CONTENT_TYPE", "Use JPEG, PNG, or WebP.", [
    { field: "content_type", message: "Use JPEG, PNG, or WebP." },
  ]);
}

export type StaffFileUploadInput = {
  accessToken: string;
  ownerType: StoredObjectOwnerType;
  ownerId: string;
  file: File;
  purpose?: string;
};

/**
 * Grant → client PUT → confirm. Confirm side-effects write article_files /
 * customer_identity_files / girvi_collateral_files for matching owner types.
 */
export async function uploadStaffFile(input: StaffFileUploadInput): Promise<StoredObject> {
  const contentType = imageContentType(input.file);
  const grantBody: FileUploadGrantRequest = {
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    content_type: contentType,
    byte_size: input.file.size,
    ...(input.purpose ? { purpose: input.purpose } : {}),
  };
  const grant = await staffRequest(input.accessToken, "/api/v1/files/upload-grants", {
    method: "POST",
    body: grantBody,
    schema: fileUploadGrantResponseSchema,
  });

  let putResponse: Response;
  try {
    putResponse = await fetch(grant.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: input.file,
    });
  } catch {
    throw new StaffApiError(0, "UPLOAD_PUT_FAILED", "Could not upload the file to storage.", []);
  }

  if (!putResponse.ok) {
    const putBody = (await putResponse.text()).slice(0, 500);
    const tooLarge =
      putResponse.status === 413 ||
      putBody.includes("EntityTooLarge") ||
      putBody.includes("Payload too large") ||
      putBody.includes("exceeded the maximum allowed size");
    throw new StaffApiError(
      putResponse.status,
      "UPLOAD_PUT_FAILED",
      tooLarge
        ? "Photograph is too large for storage. Maximum size is 5 MB."
        : "Could not upload the file to storage.",
      [],
    );
  }

  const checksum = await sha256Hex(input.file);
  return staffRequest(input.accessToken, `/api/v1/files/${grant.stored_object_id}/confirm`, {
    method: "POST",
    body: {
      checksum_sha256: checksum,
      byte_size: input.file.size,
      ...(input.purpose ? { purpose: input.purpose } : {}),
      original_filename: input.file.name.slice(0, 255),
    },
    schema: storedObjectSchema,
  });
}

export async function fetchFileAccess(
  accessToken: string,
  storedObjectId: string,
): Promise<{ url: string; expires_in_seconds: number }> {
  return staffRequest(accessToken, `/api/v1/files/${storedObjectId}/access`, {
    schema: fileAccessSchema,
  });
}

export async function fetchFileAccessByObjectKey(
  accessToken: string,
  objectKey: string,
): Promise<{ url: string; expires_in_seconds: number }> {
  const params = new URLSearchParams({ object_key: objectKey });
  return staffRequest(accessToken, `/api/v1/files/access-by-key?${params.toString()}`, {
    schema: fileAccessSchema,
  });
}
