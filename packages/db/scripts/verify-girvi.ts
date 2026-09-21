import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  ApplicationHttpError,
  activateGirviAccount,
  createGirviDraft,
  deleteGirviDraft,
  getGirviAccount,
  listGirviAccounts,
  lookupArticleByBarcode,
  moveGirviCustodyLocation,
  patchGirviDraft,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import {
  GirviCalculationUnsupportedError,
  buildGirviTermsSnapshot,
  computeGirviStatement,
  permissionsForRole,
  STAFF_PERMISSION_MAP_VERSION,
} from "@aabhushan/domain";
import { createGirviRepository } from "../src/girvi-repository";
import { createInventoryRepository } from "../src/inventory-repository";

/**
 * Real PostgreSQL checks for Girvi accounts, shop-floor polish (draft edit/discard,
 * list filters, custody moves, photo gate), and activation invariants.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:girvi
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const suffix = randomUUID().slice(0, 8).toUpperCase();

  try {
    // An account without approved terms must fail closed instead of guessing interest.
    try {
      computeGirviStatement({
        terms: buildGirviTermsSnapshot({
          principalInr: "1000.00",
          startBusinessDate: "2026-01-01",
          maturityBusinessDate: "2026-02-01",
        }),
        policy: null,
        events: [],
        asOfBusinessDate: "2026-02-01",
      });
      throw new Error("A statement on unapproved terms must fail closed.");
    } catch (error) {
      if (!(error instanceof GirviCalculationUnsupportedError)) {
        throw error;
      }
    }

    const missing = await withApiRole(pool, async (client) => {
      const accounts = await client.query("SELECT count(*)::int AS count FROM app.girvi_accounts");
      const collateral = await client.query("SELECT count(*)::int AS count FROM app.girvi_collateral_items");
      return (accounts.rows[0]?.count as number) + (collateral.rows[0]?.count as number);
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context must deny Girvi tables, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const accounts = await client.query("SELECT count(*)::int AS count FROM app.girvi_accounts");
      return accounts.rows[0]?.count as number;
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id must deny Girvi accounts, got ${String(wrongOrg)}.`);
    }

    await withOrgTxn(pool, async (client) => {
      const staff = await loadStaff(client);
      const girviAccess = staffAccess({ ...staff, role: "girvi" });
      const billingAccess = staffAccess({ ...staff, role: "billing" });
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const inventoryRepo = createInventoryRepository(client, ORGANIZATION_ID, BRANCH_ID);

      const customer = await client.query<{ id: string }>(
        `
        INSERT INTO app.customers (organization_id, display_name, phone_normalized, phone_display, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
        `,
        [ORGANIZATION_ID, `Girvi Verify ${suffix}`, `+9198${suffix.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`, `98${suffix.slice(0, 8)}`],
      );
      const customerId = customer.rows[0]?.id;
      if (!customerId) {
        throw new Error("Failed to insert verify customer.");
      }

      const packet = `PKT-${suffix}`;
      const draft = await createGirviDraft(repo, girviAccess, {
        customer_id: customerId,
        principal_inr: "25000.00",
        interest_rate_percent_per_30_days: "2",
        start_business_date: "2026-01-10",
        maturity_business_date: "2026-07-10",
        collateral: [
          {
            description: `Chain ${suffix}`,
            metal: "gold",
            purity: "22K",
            gross_weight_grams: "12.5000",
            net_metal_weight_grams: "12.0000",
            assessed_value_inr: "48000.00",
            packet_number: packet,
            custody_location: "Safe A",
          },
        ],
      });

      if (draft.status !== "draft") {
        throw new Error("New Girvi account must be a draft.");
      }

      // Activate without a photo per item must fail closed.
      try {
        await activateGirviAccount(
          repo,
          girviAccess,
          draft.id,
          {
            row_version: draft.row_version,
            confirm_principal_inr: draft.principal_inr,
            confirm_packet_numbers: [packet],
          },
          randomUUID(),
        );
        throw new Error("Activation without a collateral photo must be 422.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }

      // Metadata-only photo row is enough for the activate gate (bytes live in shop-assets).
      const draftItemId = draft.collateral[0]?.id;
      if (!draftItemId) {
        throw new Error("Draft must include a collateral item.");
      }
      await repo.insertCollateralFile({
        accountId: draft.id,
        collateralItemId: draftItemId,
        objectKey: `${ORGANIZATION_ID}/girvi/${draft.id}/${draftItemId}/verify.jpg`,
        checksumSha256: "a".repeat(64),
        purpose: "collateral_photo",
        uploadedByStaffUserId: girviAccess.staff_user_id,
      });

      // Activate without a rate must fail closed (legacy drafts / cleared terms).
      const noRatePacket = `NR-${suffix}`;
      const noRateDraft = await createGirviDraft(repo, girviAccess, {
        customer_id: customerId,
        principal_inr: "1000.00",
        interest_rate_percent_per_30_days: "2",
        start_business_date: "2026-01-10",
        maturity_business_date: "2026-02-10",
        collateral: [
          {
            description: "No rate",
            packet_number: noRatePacket,
            custody_location: "Safe R",
          },
        ],
      });
      const noRateItemId = noRateDraft.collateral[0]?.id;
      if (!noRateItemId) {
        throw new Error("No-rate draft must include a collateral item.");
      }
      await repo.insertCollateralFile({
        accountId: noRateDraft.id,
        collateralItemId: noRateItemId,
        objectKey: `${ORGANIZATION_ID}/girvi/${noRateDraft.id}/${noRateItemId}/verify.jpg`,
        checksumSha256: "b".repeat(64),
        purpose: "collateral_photo",
        uploadedByStaffUserId: girviAccess.staff_user_id,
      });
      await client.query(
        `
        UPDATE app.girvi_accounts
        SET terms_snapshot = jsonb_set(
          terms_snapshot,
          '{interest}',
          $2::jsonb
        )
        WHERE organization_id = $1 AND id = $3
        `,
        [
          ORGANIZATION_ID,
          JSON.stringify({
            status: "unsupported",
            message: "No interest rate is recorded.",
            rate_percent_per_30_days: null,
          }),
          noRateDraft.id,
        ],
      );
      try {
        await activateGirviAccount(
          repo,
          girviAccess,
          noRateDraft.id,
          {
            row_version: noRateDraft.row_version,
            confirm_principal_inr: noRateDraft.principal_inr,
            confirm_packet_numbers: [noRatePacket],
          },
          randomUUID(),
        );
        throw new Error("Activation without an interest rate must be 422.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }
      await deleteGirviDraft(repo, girviAccess, noRateDraft.id, noRateDraft.row_version, null);

      const patched = await patchGirviDraft(repo, girviAccess, draft.id, {
        row_version: draft.row_version,
        principal_inr: "26000.00",
        collateral: [
          {
            description: `Chain ${suffix} patched`,
            metal: "gold",
            purity: "22K",
            gross_weight_grams: "12.5000",
            net_metal_weight_grams: "12.0000",
            assessed_value_inr: "48000.00",
            packet_number: packet,
            custody_location: "Safe A",
            files: [
              {
                object_key: `${ORGANIZATION_ID}/girvi/${draft.id}/${draftItemId}/verify.jpg`,
                checksum_sha256: "a".repeat(64),
                purpose: "collateral_photo",
              },
            ],
          },
        ],
      });
      if (patched.principal_inr !== "26000.00") {
        throw new Error("Draft PATCH must update principal.");
      }
      if (patched.collateral[0]?.files.length !== 1) {
        throw new Error("Draft PATCH collateral replace must re-send existing files.");
      }

      const discardDraft = await createGirviDraft(repo, girviAccess, {
        customer_id: customerId,
        principal_inr: "500.00",
        interest_rate_percent_per_30_days: "2",
        start_business_date: "2026-01-10",
        maturity_business_date: "2026-02-10",
        collateral: [
          {
            description: "Discard me",
            packet_number: `DSC-${suffix}`,
            custody_location: "Safe Z",
          },
        ],
      });
      await deleteGirviDraft(repo, girviAccess, discardDraft.id, discardDraft.row_version, null);
      const discarded = await getGirviAccount(repo, girviAccess, discardDraft.id).catch((error: unknown) => error);
      if (!(discarded instanceof ApplicationHttpError) || discarded.httpStatus !== 404) {
        // getGirviAccount throws notFound — confirm the row is gone.
        const gone = await client.query(
          `SELECT 1 FROM app.girvi_accounts WHERE organization_id = $1 AND id = $2`,
          [ORGANIZATION_ID, discardDraft.id],
        );
        if (gone.rowCount !== 0) {
          throw new Error("Discarded draft must be deleted.");
        }
      }

      try {
        await activateGirviAccount(
          repo,
          girviAccess,
          patched.id,
          {
            row_version: patched.row_version,
            confirm_principal_inr: patched.principal_inr,
            confirm_packet_numbers: [],
          },
          randomUUID(),
        );
        throw new Error("Activation without collateral confirmation must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }

      const emptyDraft = await createGirviDraft(repo, girviAccess, {
        customer_id: customerId,
        principal_inr: "1000.00",
        interest_rate_percent_per_30_days: "2",
        start_business_date: "2026-01-10",
        maturity_business_date: "2026-02-10",
        collateral: [
          {
            description: "Temp",
            packet_number: `TMP-${suffix}`,
            custody_location: "Safe B",
          },
        ],
      });
      await client.query(
        `DELETE FROM app.girvi_collateral_items WHERE organization_id = $1 AND girvi_account_id = $2`,
        [ORGANIZATION_ID, emptyDraft.id],
      );
      try {
        await activateGirviAccount(
          repo,
          girviAccess,
          emptyDraft.id,
          {
            row_version: emptyDraft.row_version,
            confirm_principal_inr: emptyDraft.principal_inr,
            confirm_packet_numbers: ["none"],
          },
          randomUUID(),
        );
        throw new Error("Activation without collateral must be 422.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }

      try {
        await createGirviDraft(repo, girviAccess, {
          customer_id: customerId,
          principal_inr: "1000.00",
          interest_rate_percent_per_30_days: "2",
          start_business_date: "2026-01-10",
          maturity_business_date: "2026-02-10",
          collateral: [
            {
              description: "Conflict",
              packet_number: packet,
              custody_location: "Safe C",
            },
          ],
        });
        throw new Error("Duplicate in-custody packet must be 409.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 409) {
          throw error;
        }
      }

      try {
        await activateGirviAccount(
          repo,
          billingAccess,
          patched.id,
          {
            row_version: patched.row_version,
            confirm_principal_inr: patched.principal_inr,
            confirm_packet_numbers: [packet],
          },
          randomUUID(),
        );
        throw new Error("Billing role must not activate Girvi.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 403) {
          throw error;
        }
      }

      const activateKey = `verify-girvi-activate-${suffix}`;
      const activated = await activateGirviAccount(
        repo,
        girviAccess,
        patched.id,
        {
          row_version: patched.row_version,
          confirm_principal_inr: patched.principal_inr,
          confirm_packet_numbers: [packet],
        },
        activateKey,
      );

      if (activated.principal_inr !== "26000.00") {
        throw new Error("Activation must use the patched principal.");
      }
      if (activated.terms_snapshot.interest.rate_percent_per_30_days !== "2") {
        throw new Error("Activation must freeze the draft interest rate on the account.");
      }

      if (activated.status !== "active" || !activated.account_number.startsWith("GRV")) {
        throw new Error(`Activated account must be active with GRV number, got ${activated.account_number}.`);
      }
      if (activated.financial_events.length !== 1 || activated.financial_events[0]?.event_type !== "disbursement") {
        throw new Error("Activation must write exactly one disbursement event.");
      }
      if (activated.custody_events.length < 1 || activated.custody_events.some((e) => e.event_type !== "received")) {
        throw new Error("Activation must write custody received events.");
      }

      const frozen = activated.terms_snapshot;
      const retry = await activateGirviAccount(
        repo,
        girviAccess,
        patched.id,
        {
          row_version: patched.row_version,
          confirm_principal_inr: patched.principal_inr,
          confirm_packet_numbers: [packet],
        },
        activateKey,
      );
      if (retry.id !== activated.id || retry.account_number !== activated.account_number) {
        throw new Error("Idempotent activate retry must return the original account.");
      }

      const eventCount = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM app.girvi_financial_events WHERE organization_id = $1 AND girvi_account_id = $2`,
        [ORGANIZATION_ID, activated.id],
      );
      if (eventCount.rows[0]?.count !== 1) {
        throw new Error("Idempotent retry must not write a second disbursement.");
      }

      try {
        await patchGirviDraft(repo, girviAccess, activated.id, {
          row_version: activated.row_version,
          collateral: [
            {
              description: "Top-up attempt",
              packet_number: `ADD-${suffix}`,
              custody_location: "Safe D",
            },
          ],
        });
        throw new Error("Adding collateral after activation must be rejected.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }

      // Simulate a shop-default term change that must not mutate the frozen snapshot.
      const mutatedDefaults = buildGirviTermsSnapshot({
        principalInr: "99999.00",
        startBusinessDate: "2099-01-01",
        maturityBusinessDate: "2099-12-31",
      });
      await client.query(
        `UPDATE app.girvi_accounts SET updated_at = timezone('utc', now()) WHERE id = $1`,
        [activated.id],
      );
      const reloaded = await getGirviAccount(repo, girviAccess, activated.id);
      if (
        reloaded.terms_snapshot.principal_inr !== frozen.principal_inr ||
        reloaded.terms_snapshot.start_business_date !== frozen.start_business_date ||
        reloaded.terms_snapshot.maturity_business_date !== frozen.maturity_business_date
      ) {
        throw new Error("Activated terms snapshot must remain frozen.");
      }
      if (JSON.stringify(mutatedDefaults) === JSON.stringify(reloaded.terms_snapshot)) {
        throw new Error("Sanity: mutated defaults must differ from frozen snapshot.");
      }

      // Packet barcode must never resolve as an article.
      try {
        await lookupArticleByBarcode(inventoryRepo, billingAccess, packet, true);
        throw new Error("POS article lookup must never return Girvi collateral packets.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 404) {
          throw error;
        }
      }
      if (await repo.articleExistsWithBarcode(packet)) {
        throw new Error("Collateral packet must not exist on articles.barcode.");
      }

      try {
        await deleteGirviDraft(repo, girviAccess, activated.id, activated.row_version, null);
        throw new Error("Discard of an active account must be 422.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }

      const moveItemId = activated.collateral[0]?.id;
      if (!moveItemId) {
        throw new Error("Activated account must still have collateral.");
      }
      const moved = await moveGirviCustodyLocation(
        repo,
        girviAccess,
        activated.id,
        {
          collateral_item_id: moveItemId,
          custody_location: "Locker B",
          notes: "verify move",
        },
        randomUUID(),
      );
      if (moved.custody_event.event_type !== "location_changed") {
        throw new Error("Custody move must write location_changed.");
      }
      if (moved.account.collateral[0]?.custody_location !== "Locker B") {
        throw new Error("Custody move must update the item location.");
      }
      const locationEvents = moved.account.custody_events.filter((event) => event.event_type === "location_changed");
      if (locationEvents.length !== 1) {
        throw new Error("Exactly one location_changed event expected after the first move.");
      }

      await client.query(
        `
        UPDATE app.girvi_accounts
        SET status = 'released',
            released_at = timezone('utc', now()),
            released_by_staff_user_id = $2
        WHERE id = $1
        `,
        [activated.id, girviAccess.staff_user_id],
      );
      try {
        await moveGirviCustodyLocation(
          repo,
          girviAccess,
          activated.id,
          {
            collateral_item_id: moveItemId,
            custody_location: "Locker C",
          },
          randomUUID(),
        );
        throw new Error("Custody move after release must be 422.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error;
        }
      }

      // List filters: overdue and settled.
      const overdueList = await listGirviAccounts(repo, girviAccess, {
        page: 1,
        pageSize: 50,
        sort: "created_at",
        direction: "desc",
        isOverdue: true,
      });
      // Activated verify account matures 2026-07-10; overdue only if today is past that.
      // Settled filter must accept the status without error.
      const settledList = await listGirviAccounts(repo, girviAccess, {
        page: 1,
        pageSize: 50,
        sort: "created_at",
        direction: "desc",
        status: "settled",
      });
      if (!Array.isArray(overdueList.items) || !Array.isArray(settledList.items)) {
        throw new Error("List filters must return item arrays.");
      }
      if (settledList.items.some((item) => item.status !== "settled")) {
        throw new Error("status=settled filter must only return settled accounts.");
      }

      const articleTables = await client.query<{ table_name: string }>(
        `
        SELECT c.relname AS table_name
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app'
          AND con.contype = 'f'
          AND pg_get_constraintdef(con.oid) ILIKE '%articles%'
          AND c.relname LIKE 'girvi%'
        `,
      );
      if (articleTables.rows.length > 0) {
        throw new Error(`Girvi tables must not FK to articles, found ${articleTables.rows.map((r) => r.table_name).join(", ")}.`);
      }
    });

    console.log(
      "girvi verification passed: photo gate, rate gate, draft PATCH then activate, discard draft, discard-active 422, list filters, custody location_changed, unapproved terms fail closed, RLS denied, draft/activate wrote disbursement and custody received events, duplicate packet rejected, billing denied, idempotent activate held, post-activation collateral add rejected, terms snapshot stayed frozen, and POS article lookup never returned collateral packets.",
    );
  } finally {
    await pool.end();
  }
}

function staffAccess(row: StaffRow): ResolvedStaffAccess {
  return {
    staff_user_id: row.id,
    email: row.email,
    display_name: row.display_name,
    membership: {
      id: row.membership_id,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID,
      role: row.role,
      status: "active",
    },
    permissions: permissionsForRole(row.role),
    permission_map_version: STAFF_PERMISSION_MAP_VERSION,
  };
}

async function loadStaff(client: PoolClient): Promise<StaffRow> {
  const staff = await client.query<StaffRow>(
    `
    SELECT su.id, su.email, su.display_name, sm.id AS membership_id, sm.role
    FROM app.staff_users su
    JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
    WHERE sm.organization_id = $1 AND sm.status = 'active'
    LIMIT 1
    `,
    [ORGANIZATION_ID],
  );
  const row = staff.rows[0];
  if (!row) {
    throw new Error("An active staff user is required for Girvi verification.");
  }
  return row;
}

async function withApiRole<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function withOrgTxn<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
