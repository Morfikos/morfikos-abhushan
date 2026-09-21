import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ShopAssetStorage } from "@aabhushan/application";
import type { ShopLogoContentType } from "@aabhushan/domain";

export const SHOP_ASSETS_BUCKET = "shop-assets";
export const SHOP_LOGO_SIGNED_URL_SECONDS = 3600;
/** Short-lived staff view for private collateral photos. */
export const GIRVI_COLLATERAL_SIGNED_URL_SECONDS = 900;
/** Short-lived staff download for private stored objects / PDFs. */
export const STORED_OBJECT_SIGNED_URL_SECONDS = 900;
export const SIGNED_UPLOAD_URL_SECONDS = 900;

const EXT_BY_TYPE: Record<ShopLogoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function extensionForContentType(contentType: string): string {
  if (contentType === "application/pdf") {
    return "pdf";
  }
  if (contentType in EXT_BY_TYPE) {
    return EXT_BY_TYPE[contentType as ShopLogoContentType];
  }
  return "bin";
}

export function createShopAssetStorage(supabaseUrl: string, secretKey: string): ShopAssetStorage {
  const supabase: SupabaseClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async uploadLogo(input) {
      const objectKey = `${input.organizationId}/logo/${randomUUID()}.${EXT_BY_TYPE[input.contentType]}`;
      const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
      const { error } = await supabase.storage.from(SHOP_ASSETS_BUCKET).upload(objectKey, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });
      if (error) {
        throw new Error(`Shop logo upload failed: ${error.message}`);
      }
      if (input.previousObjectKey && input.previousObjectKey !== objectKey) {
        await supabase.storage.from(SHOP_ASSETS_BUCKET).remove([input.previousObjectKey]);
      }
      return {
        objectKey,
        checksumSha256,
        byteSize: input.bytes.length,
        contentType: input.contentType,
      };
    },

    async uploadPrivateObject(input) {
      const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
      const { error } = await supabase.storage.from(SHOP_ASSETS_BUCKET).upload(input.objectKey, input.bytes, {
        contentType: input.contentType,
        upsert: input.upsert === true,
      });
      if (error) {
        throw new Error(`Private shop-asset upload failed: ${error.message}`);
      }
      return {
        objectKey: input.objectKey,
        checksumSha256,
        byteSize: input.bytes.length,
        contentType: input.contentType,
      };
    },

    async createSignedUploadUrl(objectKey, expiresInSeconds = SIGNED_UPLOAD_URL_SECONDS) {
      const { data, error } = await supabase.storage
        .from(SHOP_ASSETS_BUCKET)
        .createSignedUploadUrl(objectKey);
      if (error || !data?.signedUrl) {
        throw new Error(`Signed upload URL failed: ${error?.message ?? "missing url"}`);
      }
      return {
        signedUrl: data.signedUrl,
        token: data.token,
        path: data.path,
        expiresInSeconds,
      };
    },

    async removeObject(objectKey) {
      const { error } = await supabase.storage.from(SHOP_ASSETS_BUCKET).remove([objectKey]);
      if (error) {
        throw new Error(`Shop asset delete failed: ${error.message}`);
      }
    },

    async createSignedUrl(objectKey, expiresInSeconds = SHOP_LOGO_SIGNED_URL_SECONDS) {
      const { data, error } = await supabase.storage
        .from(SHOP_ASSETS_BUCKET)
        .createSignedUrl(objectKey, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(`Shop asset signed URL failed: ${error?.message ?? "missing url"}`);
      }
      return data.signedUrl;
    },

    async downloadAsDataUri(objectKey, contentType) {
      const { data, error } = await supabase.storage.from(SHOP_ASSETS_BUCKET).download(objectKey);
      if (error || !data) {
        return null;
      }
      const buffer = Buffer.from(await data.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    },
  };
}

export function girviCollateralObjectKey(input: {
  organizationId: string;
  accountId: string;
  itemId: string;
  contentType: ShopLogoContentType;
}): string {
  return `${input.organizationId}/girvi/${input.accountId}/${input.itemId}/${randomUUID()}.${EXT_BY_TYPE[input.contentType]}`;
}

export function storedObjectKey(input: {
  organizationId: string;
  ownerType: string;
  ownerId: string;
  contentType: string;
}): string {
  return `${input.organizationId}/${input.ownerType}/${input.ownerId}/${randomUUID()}.${extensionForContentType(input.contentType)}`;
}

export function documentObjectKey(input: {
  organizationId: string;
  documentType: string;
  ownerId: string;
}): string {
  return `${input.organizationId}/documents/${input.documentType}/${input.ownerId}.pdf`;
}
