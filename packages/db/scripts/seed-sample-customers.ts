import { Pool } from "pg";

import {
  CUSTOMER_CONSENT_CHANNEL_WHATSAPP,
  CUSTOMER_CONSENT_PURPOSES,
  normalizeShopPhone,
} from "@aabhushan/domain";

/**
 * Insert five sample customers for local UI testing.
 * Idempotent: skips rows whose demo phone already exists.
 * Usage: pnpm --filter @aabhushan/db seed:sample-customers
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

const SAMPLES = [
  {
    displayName: "Priya Sharma",
    phone: "9876500001",
    email: "priya.sharma.demo@example.com",
    addressLine: "12 MG Road, Srinagar",
    notes: "Demo customer — prefers WhatsApp invoices.",
    grantWhatsapp: true,
    language: "en" as const,
  },
  {
    displayName: "Ramesh Kumar",
    phone: "9876500002",
    email: null,
    addressLine: "Lal Chowk, Srinagar",
    notes: "Demo customer — no messaging consent yet.",
    grantWhatsapp: false,
    language: "en" as const,
  },
  {
    displayName: "Anjali Devi",
    phone: "9876500003",
    email: "anjali.demo@example.com",
    addressLine: null,
    notes: null,
    grantWhatsapp: true,
    language: "hi" as const,
  },
  {
    displayName: "Mohammed Ali",
    phone: "9876500004",
    email: null,
    addressLine: "Residency Road, Srinagar",
    notes: "Demo customer — Girvi enquiries common.",
    grantWhatsapp: true,
    language: "en" as const,
  },
  {
    displayName: "Kavita Patel",
    phone: "9876500005",
    email: "kavita.demo@example.com",
    addressLine: "Rajbagh, Srinagar",
    notes: "Demo customer — walk-in sales only.",
    grantWhatsapp: false,
    language: "en" as const,
  },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);

    const created: { display_name: string; phone: string; whatsapp: string; status: string }[] = [];

    for (const sample of SAMPLES) {
      const phone = normalizeShopPhone(sample.phone);
      if (phone.kind !== "ok") {
        throw new Error(`Invalid sample phone ${sample.phone}: ${phone.kind === "invalid" ? phone.message : "empty"}`);
      }

      const existing = await client.query<{ id: string }>(
        `
        SELECT id
        FROM app.customers
        WHERE organization_id = $1 AND phone_normalized = $2
        LIMIT 1
        `,
        [ORGANIZATION_ID, phone.normalized],
      );
      if (existing.rows[0]) {
        created.push({
          display_name: sample.displayName,
          phone: phone.display,
          whatsapp: sample.grantWhatsapp ? "granted" : "none",
          status: "skipped_existing",
        });
        continue;
      }

      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO app.customers (
          organization_id, display_name, phone_normalized, phone_display,
          email, address_line, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [
          ORGANIZATION_ID,
          sample.displayName,
          phone.normalized,
          phone.display,
          sample.email,
          sample.addressLine,
          sample.notes,
        ],
      );
      const customerId = inserted.rows[0]?.id;
      if (!customerId) {
        throw new Error(`Failed to insert ${sample.displayName}.`);
      }

      if (sample.grantWhatsapp) {
        for (const purpose of CUSTOMER_CONSENT_PURPOSES) {
          await client.query(
            `
            INSERT INTO app.customer_consents (
              organization_id, customer_id, channel, purpose, status, granted_at, language
            )
            VALUES ($1, $2, $3, $4, 'granted', timezone('utc', now()), $5)
            `,
            [ORGANIZATION_ID, customerId, CUSTOMER_CONSENT_CHANNEL_WHATSAPP, purpose, sample.language],
          );
        }
      }

      created.push({
        display_name: sample.displayName,
        phone: phone.display,
        whatsapp: sample.grantWhatsapp ? "granted" : "none",
        status: "created",
      });
    }

    const walkInExisting = await client.query<{ id: string }>(
      `
      SELECT id
      FROM app.customers
      WHERE organization_id = $1 AND is_walk_in
      LIMIT 1
      `,
      [ORGANIZATION_ID],
    );
    if (walkInExisting.rows[0]) {
      created.push({
        display_name: "Walk-in",
        phone: "(none)",
        whatsapp: "none",
        status: "skipped_existing",
      });
    } else {
      await client.query(
        `
        INSERT INTO app.customers (
          organization_id, display_name, phone_normalized, phone_display,
          email, address_line, notes, is_walk_in
        )
        VALUES ($1, 'Walk-in', NULL, NULL, NULL, NULL, 'System walk-in POS customer.', true)
        `,
        [ORGANIZATION_ID],
      );
      created.push({
        display_name: "Walk-in",
        phone: "(none)",
        whatsapp: "none",
        status: "created",
      });
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ organization_id: ORGANIZATION_ID, customers: created }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
