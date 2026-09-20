import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  ApplicationHttpError,
  createCustomer,
  listCustomerIdentityFiles,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import { permissionsForRole, STAFF_PERMISSION_MAP_VERSION } from "@aabhushan/domain";
import { createCustomerRepository } from "../src/customer-repository";

/**
 * Real PostgreSQL and application checks for spec 06: duplicate phone,
 * WhatsApp consent without phone, and identity-file permission.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:customers
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const missing = await withApiRole(pool, async (client) => {
      const result = await client.query("SELECT count(*)::int AS count FROM app.customers");
      return result.rows[0]?.count as number;
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context should deny customers, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const result = await client.query("SELECT count(*)::int AS count FROM app.customers");
      return result.rows[0]?.count as number;
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id should deny customers, got ${String(wrongOrg)}.`);
    }

    await withOrg(pool, async (client) => {
      const staff = await client.query<{
        id: string;
        email: string;
        display_name: string;
        membership_id: string;
        role: "owner" | "admin" | "billing" | "inventory" | "girvi";
      }>(
        `
        SELECT su.id, su.email, su.display_name, sm.id AS membership_id, sm.role
        FROM app.staff_users su
        JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
        WHERE sm.organization_id = $1 AND sm.status = 'active'
        LIMIT 1
        `,
        [ORGANIZATION_ID],
      );
      const staffRow = staff.rows[0];
      if (!staffRow) {
        throw new Error("An active staff user is required for customer verification.");
      }

      const repo = createCustomerRepository(client, ORGANIZATION_ID);
      const ownerAccess = staffAccess(staffRow);
      const billingAccess = staffAccess({ ...staffRow, role: "billing" });
      const suffix = randomUUID().slice(0, 8);
      const phoneDisplay = `98${suffix.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`;

      const first = await createCustomer(repo, ownerAccess, {
        display_name: `Verify Customer ${suffix}`,
        phone: phoneDisplay,
      });
      if (!first.phone_normalized?.startsWith("+91")) {
        throw new Error("Shop-normalized Indian numbers must become E.164 +91.");
      }
      if (first.sales.total !== 0 || first.girvi.total !== 0) {
        throw new Error("Sales and Girvi activity must stay empty and separate.");
      }

      try {
        await createCustomer(repo, ownerAccess, {
          display_name: `Verify Duplicate ${suffix}`,
          phone: phoneDisplay,
        });
        throw new Error("Duplicate phone must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "PHONE_CONFLICT") {
          throw error instanceof Error ? error : new Error("Duplicate phone must fail as PHONE_CONFLICT.");
        }
        if (error.httpStatus !== 409 || error.existingCustomerId !== first.id) {
          throw new Error("Duplicate phone 409 must include the existing customer id for a permitted caller.");
        }
      }

      const duplicateSql = await withSavepoint(client, "duplicate_phone", () =>
        client.query(
          `
          INSERT INTO app.customers (organization_id, display_name, phone_normalized, phone_display)
          VALUES ($1, $2, $3, $4)
          `,
          [ORGANIZATION_ID, `Verify SQL Dup ${suffix}`, first.phone_normalized, phoneDisplay],
        ),
      );
      if (duplicateSql !== "23505") {
        throw new Error(`Duplicate normalized phone must be rejected by unique index, got ${duplicateSql}.`);
      }

      try {
        await createCustomer(repo, ownerAccess, {
          display_name: `Verify Consent ${suffix}`,
          consents: [
            {
              channel: "whatsapp",
              purpose: "due_reminder",
              status: "granted",
            },
          ],
        });
        throw new Error("WhatsApp consent without phone must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error instanceof Error ? error : new Error("Consent without phone must fail as 422.");
        }
      }

      const noPhoneA = await createCustomer(repo, ownerAccess, {
        display_name: `Verify No Phone A ${suffix}`,
      });
      const noPhoneB = await createCustomer(repo, ownerAccess, {
        display_name: `Verify No Phone B ${suffix}`,
      });
      if (!noPhoneA.id || !noPhoneB.id || noPhoneA.phone_normalized || noPhoneB.phone_normalized) {
        throw new Error("Multiple customers without phone must be allowed.");
      }

      await client.query(
        `
        INSERT INTO app.customer_identity_files (
          organization_id, customer_id, object_key, checksum_sha256, uploaded_by_staff_user_id, purpose
        )
        VALUES ($1, $2, $3, $4, $5, 'aadhaar')
        `,
        [
          ORGANIZATION_ID,
          first.id,
          `verify/identity/${suffix}.bin`,
          "a".repeat(64),
          staffRow.id,
        ],
      );

      try {
        await listCustomerIdentityFiles(repo, billingAccess, first.id);
        throw new Error("Billing staff must not read identity files.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 403) {
          throw error instanceof Error ? error : new Error("Billing identity-file access must fail as 403.");
        }
      }

      const ownerFiles = await listCustomerIdentityFiles(repo, ownerAccess, first.id);
      if (ownerFiles.length !== 1 || ownerFiles[0]?.purpose !== "aadhaar") {
        throw new Error("Owner must read identity-file metadata.");
      }
    });

    console.log(
      "customer verification passed: missing context denied, wrong org denied, unique phone held, duplicate returns 409 with existing id, WhatsApp consent without phone is 422, billing identity files are 403.",
    );
  } finally {
    await pool.end();
  }
}

function staffAccess(row: {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
}): ResolvedStaffAccess {
  return {
    staff_user_id: row.id,
    email: row.email,
    display_name: row.display_name,
    membership: {
      id: row.membership_id,
      organization_id: ORGANIZATION_ID,
      branch_id: "22222222-2222-4222-8222-222222222222",
      role: row.role,
      status: "active",
    },
    permissions: permissionsForRole(row.role),
    permission_map_version: STAFF_PERMISSION_MAP_VERSION,
    authUserId: randomUUID(),
  };
}

async function withSavepoint(client: import("pg").PoolClient, name: string, fn: () => Promise<unknown>): Promise<string> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return "accepted";
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return pgCode(error);
  }
}

function pgCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "error";
}

async function withOrg<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function withApiRole<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
