import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ShopAssetStorage } from "@aabhushan/application";
import type { ShopLogoContentType } from "@aabhushan/domain";

export const SHOP_ASSETS_BUCKET = "shop-assets";
export const SHOP_LOGO_SIGNED_URL_SECONDS = 3600;

const EXT_BY_TYPE: Record<ShopLogoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

    async removeObject(objectKey) {
      const { error } = await supabase.storage.from(SHOP_ASSETS_BUCKET).remove([objectKey]);
      if (error) {
        throw new Error(`Shop logo delete failed: ${error.message}`);
      }
    },

    async createSignedUrl(objectKey, expiresInSeconds = SHOP_LOGO_SIGNED_URL_SECONDS) {
      const { data, error } = await supabase.storage
        .from(SHOP_ASSETS_BUCKET)
        .createSignedUrl(objectKey, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(`Shop logo signed URL failed: ${error?.message ?? "missing url"}`);
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
