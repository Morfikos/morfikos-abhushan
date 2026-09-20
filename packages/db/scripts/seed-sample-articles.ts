import { Pool } from "pg";

/**
 * Insert five sample saleable articles for local UI testing.
 * Usage: pnpm --filter @aabhushan/db seed:sample-articles
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";

const SAMPLES = [
  {
    categoryName: "Rings",
    metal: "gold" as const,
    purity: "22K",
    gross: "4.5200",
    nonMetal: "0.1200",
    net: "4.4000",
    locationName: "Tray 1",
    huid: "HUIDDEMO001",
    supplierRef: "SUP-RING-01",
    cost: "28500.00",
  },
  {
    categoryName: "Chains",
    metal: "gold" as const,
    purity: "22K",
    gross: "12.3400",
    nonMetal: "0.0000",
    net: "12.3400",
    locationName: "Counter",
    huid: "HUIDDEMO002",
    supplierRef: "SUP-CHAIN-01",
    cost: "74200.00",
  },
  {
    categoryName: "Earrings",
    metal: "gold" as const,
    purity: "18K",
    gross: "3.1000",
    nonMetal: "0.4500",
    net: "2.6500",
    locationName: "Tray 1",
    huid: null,
    supplierRef: "SUP-EAR-01",
    cost: "19800.00",
  },
  {
    categoryName: "Bangles",
    metal: "gold" as const,
    purity: "22K",
    gross: "18.7500",
    nonMetal: "0.0000",
    net: "18.7500",
    locationName: "Safe",
    huid: "HUIDDEMO004",
    supplierRef: null,
    cost: "112500.00",
  },
  {
    categoryName: "Coins",
    metal: "silver" as const,
    purity: "999",
    gross: "10.0000",
    nonMetal: "0.0000",
    net: "10.0000",
    locationName: "Counter",
    huid: null,
    supplierRef: "SUP-COIN-01",
    cost: "1250.00",
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

    const staff = await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM app.staff_users ORDER BY created_at ASC LIMIT 1",
    );
    const staffUserId = staff.rows[0]?.id;
    if (!staffUserId) {
      throw new Error("No staff user found to attribute receipt movements.");
    }

    const categories = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM app.catalogue_categories WHERE organization_id = $1 AND is_active",
      [ORGANIZATION_ID],
    );
    const categoryByName = new Map(categories.rows.map((row) => [row.name, row.id]));

    const locations = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM app.storage_locations WHERE organization_id = $1 AND branch_id = $2",
      [ORGANIZATION_ID, BRANCH_ID],
    );
    const locationByName = new Map(locations.rows.map((row) => [row.name, row.id]));

    const created: { article_number: string; category: string; status: string }[] = [];

    for (const sample of SAMPLES) {
      const categoryId = categoryByName.get(sample.categoryName);
      if (!categoryId) {
        throw new Error(`Missing category ${sample.categoryName}.`);
      }
      const locationId = sample.locationName ? locationByName.get(sample.locationName) : null;
      if (sample.locationName && !locationId) {
        throw new Error(`Missing location ${sample.locationName}.`);
      }

      const seq = await client.query<{ prefix: string; padding: number; next_value: number }>(
        `
        SELECT prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'article'
        FOR UPDATE
        `,
        [ORGANIZATION_ID, BRANCH_ID],
      );
      const sequence = seq.rows[0];
      if (!sequence) {
        throw new Error("Article document sequence is missing.");
      }
      const articleNumber = `${sequence.prefix}${String(sequence.next_value).padStart(sequence.padding, "0")}`;
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = next_value + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'article'
        `,
        [ORGANIZATION_ID, BRANCH_ID],
      );

      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          huid, supplier_ref, receipt_business_date, acquisition_cost_inr,
          location_id, status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7::numeric, $8::numeric, $9::numeric,
          $10, $11, (timezone('Asia/Kolkata', now()))::date, $12::numeric,
          $13, 'available'
        )
        RETURNING id
        `,
        [
          ORGANIZATION_ID,
          BRANCH_ID,
          articleNumber,
          categoryId,
          sample.metal,
          sample.purity,
          sample.gross,
          sample.nonMetal,
          sample.net,
          sample.huid,
          sample.supplierRef,
          sample.cost,
          locationId ?? null,
        ],
      );

      const articleId = inserted.rows[0]?.id;
      if (!articleId) {
        throw new Error(`Failed to insert ${articleNumber}.`);
      }

      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, actor_staff_user_id
        )
        VALUES ($1, $2, 'receipt', NULL, 'available', $3)
        `,
        [ORGANIZATION_ID, articleId, staffUserId],
      );

      created.push({ article_number: articleNumber, category: sample.categoryName, status: "available" });
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ actor: staff.rows[0]?.email, created }, null, 2));
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
