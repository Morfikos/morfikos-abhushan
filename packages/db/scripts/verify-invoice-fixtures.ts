import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CalculationDomainError,
  INVOICE_V1_POLICY_METHODS,
  quoteInvoice,
  type CalculationPolicy,
  type InvoiceQuoteInput,
  type InvoiceQuoteResult,
} from "@aabhushan/domain";

/**
 * Fixture harness for owner-approved invoice examples.
 * Usage: pnpm --filter @aabhushan/db verify:invoice-fixtures
 *
 * Always verifies fail-closed draft / incomplete-policy behavior.
 * With fixtures present, requires exact breakdown matches.
 */

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../domain/fixtures/invoice-examples",
);

type FixtureFile = {
  id: string;
  policyVersion: string;
  policy: CalculationPolicy;
  input: InvoiceQuoteInput;
  expected: InvoiceQuoteResult;
};

async function loadFixtures(): Promise<FixtureFile[]> {
  const entries = await readdir(FIXTURES_DIR);
  const files = entries.filter((name) => name.endsWith(".json")).sort();
  const fixtures: FixtureFile[] = [];
  for (const name of files) {
    const raw = await readFile(path.join(FIXTURES_DIR, name), "utf8");
    fixtures.push(JSON.parse(raw) as FixtureFile);
  }
  return fixtures;
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label} mismatch.\nExpected: ${right}\nActual: ${left}`);
  }
}

function draftPolicy(version: string): CalculationPolicy {
  return {
    version,
    status: "draft",
    currency: "INR",
    weightUnit: "g",
    rateUnit: "per_g",
    makingChargeMethod: null,
    wastageMethod: null,
    discountMethod: null,
    taxMethod: null,
    roundingMode: null,
    roundingScale: null,
  };
}

function approvedInvoiceV1Policy(): CalculationPolicy {
  return {
    version: INVOICE_V1_POLICY_METHODS.version,
    status: "approved",
    currency: "INR",
    weightUnit: "g",
    rateUnit: "per_g",
    makingChargeMethod: INVOICE_V1_POLICY_METHODS.makingChargeMethod,
    wastageMethod: INVOICE_V1_POLICY_METHODS.wastageMethod,
    discountMethod: INVOICE_V1_POLICY_METHODS.discountMethod,
    taxMethod: INVOICE_V1_POLICY_METHODS.taxMethod,
    roundingMode: INVOICE_V1_POLICY_METHODS.roundingMode,
    roundingScale: INVOICE_V1_POLICY_METHODS.roundingScale,
  };
}

function sampleInput(policyVersion: string): InvoiceQuoteInput {
  return {
    policyVersion,
    businessDate: "2026-09-20",
    lines: [
      {
        lineId: "line-1",
        metal: "gold",
        purity: "22K",
        grossWeightGrams: "10.0000",
        nonMetalWeightGrams: "0.0000",
        netMetalWeightGrams: "10.0000",
        ratePerGram: "7000.000000",
        makingChargeInput: { method: "fixed", amountInr: "0.00" },
        wastageInput: { method: "none" },
        stoneCharges: [],
        lineDiscountInput: null,
      },
    ],
    invoiceDiscountInput: null,
    taxInput: { method: "gst_jewellery_intra" },
  };
}

async function verifyFailClosed(): Promise<void> {
  try {
    quoteInvoice(sampleInput("invoice.v1"), draftPolicy("invoice.v1"));
    throw new Error("Draft policy must not produce a quote total.");
  } catch (error) {
    if (!(error instanceof CalculationDomainError) || error.code !== "CALCULATION_POLICY_UNAPPROVED") {
      throw error instanceof Error ? error : new Error("Expected CALCULATION_POLICY_UNAPPROVED.");
    }
  }

  const approvedEmpty: CalculationPolicy = {
    ...draftPolicy("invoice.v1"),
    status: "approved",
  };

  try {
    quoteInvoice(sampleInput("invoice.v1"), approvedEmpty);
    throw new Error("Approved policy without owner methods must not invent totals.");
  } catch (error) {
    if (!(error instanceof CalculationDomainError) || error.code !== "CALCULATION_RULE_UNSUPPORTED") {
      throw error instanceof Error ? error : new Error("Expected CALCULATION_RULE_UNSUPPORTED.");
    }
  }

  try {
    quoteInvoice(
      {
        ...sampleInput("invoice.v1"),
        lines: [
          {
            ...sampleInput("invoice.v1").lines[0]!,
            grossWeightGrams: "1.00001",
            netMetalWeightGrams: "1.00001",
          },
        ],
      },
      approvedInvoiceV1Policy(),
    );
    throw new Error("Weight beyond NUMERIC(14,4) must be rejected.");
  } catch (error) {
    if (!(error instanceof CalculationDomainError) || error.code !== "CALCULATION_INPUT_INVALID") {
      throw error instanceof Error ? error : new Error("Expected CALCULATION_INPUT_INVALID.");
    }
  }

  try {
    quoteInvoice(
      {
        ...sampleInput("invoice.v1"),
        lines: [
          {
            ...sampleInput("invoice.v1").lines[0]!,
            lineDiscountInput: { method: "amount", amountInr: "999999.00" },
          },
        ],
      },
      approvedInvoiceV1Policy(),
    );
    throw new Error("Excessive line discount must be rejected.");
  } catch (error) {
    if (!(error instanceof CalculationDomainError) || error.code !== "CALCULATION_INPUT_INVALID") {
      throw error instanceof Error ? error : new Error("Expected CALCULATION_INPUT_INVALID for discount.");
    }
  }
}

async function main(): Promise<void> {
  await verifyFailClosed();

  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    throw new Error("Expected owner-approved invoice.v1 fixtures; found none.");
  }

  for (const fixture of fixtures) {
    if (fixture.input.policyVersion !== fixture.policyVersion) {
      throw new Error(`Fixture ${fixture.id}: input.policyVersion must match policyVersion.`);
    }
    if (fixture.policy.version !== fixture.policyVersion) {
      throw new Error(`Fixture ${fixture.id}: policy.version must match policyVersion.`);
    }
    const actual = quoteInvoice(fixture.input, fixture.policy);
    assertDeepEqual(actual, fixture.expected, `Fixture ${fixture.id}`);
  }

  console.log(JSON.stringify({ fixtures: fixtures.length, fail_closed: "passed", status: "passed" }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
