import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GIRVI_V1_POLICY_METHODS,
  GirviAsOfBeforeLedgerError,
  GirviBackdatedEventError,
  GirviCalculationUnsupportedError,
  allocateGirviRepayment,
  computeGirviStatement,
  girviElapsedDays,
  type GirviCalculationPolicy,
  type GirviLedgerEvent,
  type GirviTermsSnapshot,
} from "@aabhushan/domain";

/**
 * Fixture harness for owner-approved girvi.v1 examples.
 * Usage: pnpm --filter @aabhushan/db verify:girvi-fixtures
 *
 * Always verifies fail-closed behavior for unapproved policies, legacy accounts
 * without approved terms, backdated events, and as-of dates before the ledger.
 * With fixtures present, requires exact matches for every check.
 */

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../domain/fixtures/girvi-examples",
);

type ExpectedBalances = {
  principalOutstandingInr: string;
  interestOutstandingInr: string;
  payoffInr: string;
  principalRecoveredInr: string;
  interestReceivedInr: string;
};

type ExpectedAllocation = {
  interestPaidInr: string;
  principalPaidInr: string;
  interestRemainingInr: string;
  principalRemainingInr: string;
  payoffAfterInr: string;
  clearsAccount: boolean;
};

type FixtureCheck = {
  label: string;
  asOfBusinessDate: string;
  expectedDays?: number;
  expectedAccrualSegmentCount?: number;
  expected?: ExpectedBalances;
  repayment?: {
    amountInr: string;
    expected?: ExpectedAllocation;
    expectedErrorCode?: string;
  };
};

type FixtureFile = {
  id: string;
  policyVersion: string;
  description: string;
  policy: GirviCalculationPolicy;
  terms: GirviTermsSnapshot;
  events: GirviLedgerEvent[];
  checks: FixtureCheck[];
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

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function approvedGirviV1Policy(): GirviCalculationPolicy {
  return {
    version: GIRVI_V1_POLICY_METHODS.version,
    status: "approved",
    ratePeriod: GIRVI_V1_POLICY_METHODS.ratePeriod,
    interestMethod: GIRVI_V1_POLICY_METHODS.interestMethod,
    dayCountConvention: GIRVI_V1_POLICY_METHODS.dayCountConvention,
    minimumPeriod: GIRVI_V1_POLICY_METHODS.minimumPeriod,
    gracePeriod: GIRVI_V1_POLICY_METHODS.gracePeriod,
    extraCharges: GIRVI_V1_POLICY_METHODS.extraCharges,
    allocationOrder: GIRVI_V1_POLICY_METHODS.allocationOrder,
    principalReductionRule: GIRVI_V1_POLICY_METHODS.principalReductionRule,
    roundingMode: GIRVI_V1_POLICY_METHODS.roundingMode,
    roundingScale: GIRVI_V1_POLICY_METHODS.roundingScale,
    backdatingPolicy: GIRVI_V1_POLICY_METHODS.backdatingPolicy,
  };
}

function approvedTerms(): GirviTermsSnapshot {
  return {
    principal_inr: "10000.00",
    start_business_date: "2026-01-01",
    maturity_business_date: "2026-07-01",
    interest: {
      status: "approved",
      policy_version: GIRVI_V1_POLICY_METHODS.version,
      rate_percent_per_30_days: "2",
      method: GIRVI_V1_POLICY_METHODS.interestMethod,
      day_count: GIRVI_V1_POLICY_METHODS.dayCountConvention,
      allocation_order: GIRVI_V1_POLICY_METHODS.allocationOrder,
      minimum_period: GIRVI_V1_POLICY_METHODS.minimumPeriod,
      grace_period: GIRVI_V1_POLICY_METHODS.gracePeriod,
      extra_charges: GIRVI_V1_POLICY_METHODS.extraCharges,
      principal_reduction: GIRVI_V1_POLICY_METHODS.principalReductionRule,
      backdating: GIRVI_V1_POLICY_METHODS.backdatingPolicy,
      rounding_mode: GIRVI_V1_POLICY_METHODS.roundingMode,
      rounding_scale: GIRVI_V1_POLICY_METHODS.roundingScale,
    },
  };
}

function disbursement(): GirviLedgerEvent {
  return {
    eventType: "disbursement",
    effectiveBusinessDate: "2026-01-01",
    principalDeltaInr: "10000.00",
    interestDeltaInr: "0.00",
    sequence: 1,
  };
}

function verifyDayCount(): void {
  assertEqual(girviElapsedDays("2026-01-01", "2026-01-01"), 0, "Same-day elapsed days");
  assertEqual(girviElapsedDays("2026-01-01", "2026-01-31"), 30, "January 1 to 31");
  assertEqual(girviElapsedDays("2026-01-01", "2026-02-01"), 31, "January 1 to February 1");
  assertEqual(girviElapsedDays("2026-02-01", "2026-03-01"), 28, "February 2026");
  assertEqual(girviElapsedDays("2028-02-01", "2028-03-01"), 29, "February 2028");
  assertEqual(girviElapsedDays("2026-01-01", "2027-01-01"), 365, "One ordinary year");
  assertEqual(girviElapsedDays("2028-01-01", "2029-01-01"), 366, "One leap year");
  // A DST-free timezone still breaks if elapsed milliseconds are divided by a day length.
  assertEqual(girviElapsedDays("2026-03-28", "2026-03-30"), 2, "Across a European DST shift");
}

function verifyFailClosed(): void {
  const legacyTerms: GirviTermsSnapshot = {
    ...approvedTerms(),
    interest: {
      status: "unsupported",
      message: "Interest terms predate girvi.v1 approval.",
      rate_percent_per_30_days: null,
    },
  };
  try {
    computeGirviStatement({
      terms: legacyTerms,
      policy: approvedGirviV1Policy(),
      events: [disbursement()],
      asOfBusinessDate: "2026-02-01",
    });
    throw new Error("A legacy account without approved terms must not produce a statement.");
  } catch (error) {
    if (!(error instanceof GirviCalculationUnsupportedError)) {
      throw error;
    }
  }

  const draftPolicy: GirviCalculationPolicy = { ...approvedGirviV1Policy(), status: "draft" };
  try {
    computeGirviStatement({
      terms: approvedTerms(),
      policy: draftPolicy,
      events: [disbursement()],
      asOfBusinessDate: "2026-02-01",
    });
    throw new Error("A draft Girvi policy must not produce a statement.");
  } catch (error) {
    if (!(error instanceof GirviCalculationUnsupportedError)) {
      throw error;
    }
  }

  const compoundPolicy: GirviCalculationPolicy = {
    ...approvedGirviV1Policy(),
    interestMethod: "compound_monthly",
  };
  try {
    computeGirviStatement({
      terms: approvedTerms(),
      policy: compoundPolicy,
      events: [disbursement()],
      asOfBusinessDate: "2026-02-01",
    });
    throw new Error("An unapproved interest method must not be approximated.");
  } catch (error) {
    if (!(error instanceof GirviCalculationUnsupportedError)) {
      throw error;
    }
  }

  try {
    computeGirviStatement({
      terms: approvedTerms(),
      policy: approvedGirviV1Policy(),
      events: [
        disbursement(),
        {
          eventType: "repayment",
          effectiveBusinessDate: "2026-01-16",
          principalDeltaInr: "-1000.00",
          interestDeltaInr: "0.00",
          sequence: 1,
        },
      ],
      asOfBusinessDate: "2026-01-10",
    });
    throw new Error("An as-of date before the latest posted event must be rejected.");
  } catch (error) {
    if (!(error instanceof GirviAsOfBeforeLedgerError)) {
      throw error;
    }
  }

  try {
    computeGirviStatement({
      terms: approvedTerms(),
      policy: approvedGirviV1Policy(),
      events: [
        {
          eventType: "repayment",
          effectiveBusinessDate: "2025-12-01",
          principalDeltaInr: "-1000.00",
          interestDeltaInr: "0.00",
          sequence: 1,
        },
        disbursement(),
      ],
      asOfBusinessDate: "2026-02-01",
    });
    throw new Error("An event before the account start date must be rejected.");
  } catch (error) {
    if (!(error instanceof GirviBackdatedEventError)) {
      throw error;
    }
  }

  // A reminder job reads the same engine and must never mutate its inputs.
  const events = [disbursement()];
  const before = JSON.stringify(events);
  computeGirviStatement({
    terms: approvedTerms(),
    policy: approvedGirviV1Policy(),
    events,
    asOfBusinessDate: "2026-02-01",
  });
  if (JSON.stringify(events) !== before) {
    throw new Error("Producing a statement must not modify the posted events.");
  }
}

function runFixtureCheck(fixture: FixtureFile, check: FixtureCheck): void {
  const label = `Fixture ${fixture.id} / ${check.label}`;
  const statement = computeGirviStatement({
    terms: fixture.terms,
    policy: fixture.policy,
    events: fixture.events,
    asOfBusinessDate: check.asOfBusinessDate,
  });

  if (check.expected) {
    assertEqual(
      statement.principalOutstandingInr,
      check.expected.principalOutstandingInr,
      `${label}: principal outstanding`,
    );
    assertEqual(
      statement.interestOutstandingInr,
      check.expected.interestOutstandingInr,
      `${label}: interest outstanding`,
    );
    assertEqual(statement.payoffInr, check.expected.payoffInr, `${label}: payoff`);
    assertEqual(
      statement.principalRecoveredInr,
      check.expected.principalRecoveredInr,
      `${label}: principal recovered`,
    );
    assertEqual(
      statement.interestReceivedInr,
      check.expected.interestReceivedInr,
      `${label}: interest received`,
    );
  }

  if (check.expectedDays !== undefined) {
    const days = statement.accrualSegments.reduce((total, segment) => total + segment.days, 0);
    assertEqual(days, check.expectedDays, `${label}: elapsed days`);
  }

  if (check.expectedAccrualSegmentCount !== undefined) {
    assertEqual(
      statement.accrualSegments.length,
      check.expectedAccrualSegmentCount,
      `${label}: accrual segment count`,
    );
  }

  if (!check.repayment) {
    return;
  }

  if (check.repayment.expectedErrorCode) {
    try {
      allocateGirviRepayment({ statement, amountInr: check.repayment.amountInr });
      throw new Error(`${label}: expected ${check.repayment.expectedErrorCode}.`);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code !== check.repayment.expectedErrorCode) {
        throw error;
      }
    }
    return;
  }

  const expected = check.repayment.expected;
  if (!expected) {
    throw new Error(`${label}: repayment needs expected or expectedErrorCode.`);
  }
  const allocation = allocateGirviRepayment({ statement, amountInr: check.repayment.amountInr });
  assertEqual(allocation.interestPaidInr, expected.interestPaidInr, `${label}: interest paid`);
  assertEqual(allocation.principalPaidInr, expected.principalPaidInr, `${label}: principal paid`);
  assertEqual(
    allocation.interestRemainingInr,
    expected.interestRemainingInr,
    `${label}: interest remaining`,
  );
  assertEqual(
    allocation.principalRemainingInr,
    expected.principalRemainingInr,
    `${label}: principal remaining`,
  );
  assertEqual(allocation.payoffAfterInr, expected.payoffAfterInr, `${label}: payoff after`);
  assertEqual(allocation.clearsAccount, expected.clearsAccount, `${label}: clears account`);
}

async function main(): Promise<void> {
  verifyDayCount();
  verifyFailClosed();

  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    throw new Error("Expected owner-approved girvi.v1 fixtures; found none.");
  }

  let checks = 0;
  for (const fixture of fixtures) {
    if (fixture.policy.version !== fixture.policyVersion) {
      throw new Error(`Fixture ${fixture.id}: policy.version must match policyVersion.`);
    }
    if (fixture.terms.interest.status !== "approved") {
      throw new Error(`Fixture ${fixture.id}: terms must carry approved interest.`);
    }
    if (fixture.terms.interest.policy_version !== fixture.policyVersion) {
      throw new Error(`Fixture ${fixture.id}: frozen terms must match policyVersion.`);
    }
    for (const check of fixture.checks) {
      runFixtureCheck(fixture, check);
      checks += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        fixtures: fixtures.length,
        checks,
        day_count: "passed",
        fail_closed: "passed",
        status: "passed",
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
