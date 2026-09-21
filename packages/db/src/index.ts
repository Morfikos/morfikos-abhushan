import { Client } from "pg";

import { createStaffAccessRepository } from "./staff-access-repository";
import { createShopSettingsRepository } from "./shop-settings-repository";
import { createStaffDirectoryRepository } from "./staff-directory-repository";
import { createInventoryRepository } from "./inventory-repository";
import { createCustomerRepository } from "./customer-repository";
import { createCalculationPolicyRepository } from "./calculation-policy-repository";
import { createInvoiceRepository } from "./invoice-repository";
import { createPaymentRepository } from "./payment-repository";
import { createReturnsRepository } from "./return-repository";
import { createGirviRepository } from "./girvi-repository";
import { createGirviCalculationPolicyRepository } from "./girvi-calculation-policy-repository";
import { createDocumentsRepository, listOrganizationsNeedingDocumentWork } from "./documents-repository";
import {
  applyWhatsAppStatusByProviderMessageId,
  createNotificationsRepository,
  insertNotificationWebhookEvent,
  listOrganizationsForReminders,
  listOrganizationsNeedingWhatsAppDispatch,
} from "./notifications-repository";
import { createReportsRepository, listOrganizationsNeedingExportWork } from "./reports-repository";
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
  createCalculationPolicyRepository,
  createCustomerRepository,
  createDocumentsRepository,
  createNotificationsRepository,
  createReportsRepository,
  createInventoryRepository,
  createInvoiceRepository,
  createPaymentRepository,
  createReturnsRepository,
  createGirviRepository,
  createGirviCalculationPolicyRepository,
  createShopSettingsRepository,
  createStaffAccessRepository,
  createStaffDirectoryRepository,
  applyWhatsAppStatusByProviderMessageId,
  insertNotificationWebhookEvent,
  listOrganizationsForReminders,
  listOrganizationsNeedingDocumentWork,
  listOrganizationsNeedingWhatsAppDispatch,
  listOrganizationsNeedingExportWork,
  withOrganizationContext,
};

export type { Pool } from "pg";
export type { CalculationPolicyRepository } from "./calculation-policy-repository";
export type { GirviCalculationPolicyRecord } from "./girvi-calculation-policy-repository";
