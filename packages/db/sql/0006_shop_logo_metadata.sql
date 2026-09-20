-- Shop logo bytes live in private Supabase Storage (bucket shop-assets).
-- PostgreSQL keeps the object key plus checksum/content metadata only.
-- Reprints and sidebar use signed URLs or embedded data URIs; never public permanent links.

ALTER TABLE app.shop_profiles
  ADD COLUMN IF NOT EXISTS logo_content_type text,
  ADD COLUMN IF NOT EXISTS logo_byte_size integer,
  ADD COLUMN IF NOT EXISTS logo_checksum_sha256 text;

ALTER TABLE app.shop_profiles
  DROP CONSTRAINT IF EXISTS shop_profiles_logo_metadata_check;

ALTER TABLE app.shop_profiles
  ADD CONSTRAINT shop_profiles_logo_metadata_check CHECK (
    (
      logo_object_key IS NULL
      AND logo_content_type IS NULL
      AND logo_byte_size IS NULL
      AND logo_checksum_sha256 IS NULL
    )
    OR (
      logo_object_key IS NOT NULL
      AND char_length(trim(logo_object_key)) > 0
      AND logo_content_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND logo_byte_size IS NOT NULL
      AND logo_byte_size > 0
      AND logo_byte_size <= 1048576
      AND logo_checksum_sha256 IS NOT NULL
      AND logo_checksum_sha256 ~ '^[a-f0-9]{64}$'
    )
  );
