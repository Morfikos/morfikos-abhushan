import { Client } from "pg";

import { createStaffAccessRepository } from "./staff-access-repository";
import { createShopSettingsRepository } from "./shop-settings-repository";
import { createStaffDirectoryRepository } from "./staff-directory-repository";
import { createInventoryRepository } from "./inventory-repository";
import { createPool, withOrganizationContext } from "./organization-context";

/**
 * Server-only database helpers. Do not import this package from the Next.js frontend.
 * Browser Supabase roles must not receive grants on the `app` schema.
 */
export async function pingDatabase(databaseUrl: string): Promise<boolean> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 8000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export {
  createPool,
  createInventoryRepository,
  createShopSettingsRepository,
  createStaffAccessRepository,
  createStaffDirectoryRepository,
  withOrganizationContext,
};

export type { Pool } from "pg";
