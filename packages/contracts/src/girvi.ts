import { z } from "zod";

import { paymentMethodSchema } from "./invoices";
import { paginationDirectionSchema, paginationQuerySchema, paginatedResponseSchema } from "./pagination";
import { businessDateSchema, metalSchema } from "./shop";

const moneyAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a money decimal string with at most 2 fractional digits.");

const signedMoneyAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Use a signed money decimal string with at most 2 fractional digits.");

/** Interest rate as a percentage per 30 days. "Monthly" is deliberately not used. */
const interestRatePercentSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a percentage with at most 6 fractional digits.")
  .refine((value) => {
    const n = Number.parseFloat(value);
    return n > 0 && n <= 100;
  }, "Rate must be above 0 and up to 100 percent per 30 days.");

const positiveMoneyAmountSchema = moneyAmountSchema.refine(
  (value) => !/^0+(\.0+)?$/.test(value),
  "Amount must be greater than zero.",
);

const weightGramsSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Use a decimal string with at most 4 fractional digits.");

export const girviAccountStatusSchema = z.enum(["draft", "active", "settled", "released"]);
export type GirviAccountStatus = z.infer<typeof girviAccountStatusSchema>;

export const girviCollateralStatusSchema = z.enum(["in_custody", "released"]);
export type GirviCollateralStatus = z.infer<typeof girviCollateralStatusSchema>;

export const girviCustodyEventTypeSchema = z.enum(["received", "location_changed", "released"]);
export type GirviCustodyEventType = z.infer<typeof girviCustodyEventTypeSchema>;

export const girviFinancialEventTypeSchema = z.enum([
  "disbursement",
  "opening_balance",
  "interest_accrual",
  "interest_recognized",
  "repayment",
  "settlement",
  "waiver",
]);
export type GirviFinancialEventType = z.infer<typeof girviFinancialEventTypeSchema>;

/**
 * Terms are frozen per account. Accounts activated before `girvi.v1` approval, or
 * without a recorded rate, keep `unsupported` and their payoff APIs stay blocked.
 */
export const girviUnsupportedInterestTermsSchema = z.object({
  status: z.literal("unsupported"),
  message: z.string().min(1),
  rate_percent_per_30_days: interestRatePercentSchema.nullable(),
});

export const girviApprovedInterestTermsSchema = z.object({
  status: z.literal("approved"),
  policy_version: z.string().min(1),
  rate_percent_per_30_days: interestRatePercentSchema,
  method: z.string().min(1),
  day_count: z.string().min(1),
  allocation_order: z.string().min(1),
  minimum_period: z.string().min(1),
  grace_period: z.string().min(1),
  extra_charges: z.string().min(1),
  principal_reduction: z.string().min(1),
  backdating: z.string().min(1),
  rounding_mode: z.string().min(1),
  rounding_scale: z.number().int().nonnegative(),
});

export const girviInterestTermsSchema = z.discriminatedUnion("status", [
  girviUnsupportedInterestTermsSchema,
  girviApprovedInterestTermsSchema,
]);

export type GirviInterestTermsDto = z.infer<typeof girviInterestTermsSchema>;

export const girviTermsSnapshotSchema = z.object({
  principal_inr: moneyAmountSchema,
  start_business_date: businessDateSchema,
  maturity_business_date: businessDateSchema,
  interest: girviInterestTermsSchema,
});

export type GirviTermsSnapshotDto = z.infer<typeof girviTermsSnapshotSchema>;

export const girviCollateralFileSchema = z.object({
  id: z.string().uuid(),
  object_key: z.string().min(1),
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  purpose: z.string().min(1),
  uploaded_by_staff_user_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});

export type GirviCollateralFile = z.infer<typeof girviCollateralFileSchema>;

export const girviCollateralFilePurposeSchema = z.enum(["collateral_photo", "packet_photo"]);
export type GirviCollateralFilePurpose = z.infer<typeof girviCollateralFilePurposeSchema>;

export const girviCollateralFileInputSchema = z
  .object({
    object_key: z.string().trim().min(1).max(500),
    checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    purpose: z.string().trim().min(1).max(100).default("collateral_photo"),
  })
  .strict();

export type GirviCollateralFileInput = z.infer<typeof girviCollateralFileInputSchema>;

/** Staff view of a private collateral photo — short-lived signed URL, never a public policy. */
export const girviCollateralFileViewSchema = z.object({
  id: z.string().uuid(),
  purpose: girviCollateralFilePurposeSchema,
  checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  signed_url: z.string().url(),
  expires_in_seconds: z.number().int().positive(),
});

export type GirviCollateralFileView = z.infer<typeof girviCollateralFileViewSchema>;

export const girviCollateralFileUploadResultSchema = z.object({
  file: girviCollateralFileSchema,
  signed_url: z.string().url().nullable(),
});

export type GirviCollateralFileUploadResult = z.infer<typeof girviCollateralFileUploadResultSchema>;

export const girviCollateralItemSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1),
  metal: metalSchema.nullable(),
  purity: z.string().nullable(),
  gross_weight_grams: z.string().nullable(),
  net_metal_weight_grams: z.string().nullable(),
  assessed_value_inr: moneyAmountSchema.nullable(),
  packet_number: z.string().min(1),
  custody_location: z.string().min(1),
  status: girviCollateralStatusSchema,
  files: z.array(girviCollateralFileSchema),
});

export type GirviCollateralItem = z.infer<typeof girviCollateralItemSchema>;

export const girviCollateralItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    metal: metalSchema.optional().nullable(),
    purity: z.string().trim().min(1).max(40).optional().nullable(),
    gross_weight_grams: weightGramsSchema.optional().nullable(),
    net_metal_weight_grams: weightGramsSchema.optional().nullable(),
    assessed_value_inr: moneyAmountSchema.optional().nullable(),
    packet_number: z.string().trim().min(1).max(80),
    custody_location: z.string().trim().min(1).max(120),
    files: z.array(girviCollateralFileInputSchema).max(20).optional(),
  })
  .strict();

export type GirviCollateralItemInput = z.infer<typeof girviCollateralItemInputSchema>;

export const girviCustodyEventSchema = z.object({
  id: z.string().uuid(),
  event_type: girviCustodyEventTypeSchema,
  packet_number: z.string().min(1),
  custody_location: z.string().nullable(),
  collateral_item_id: z.string().uuid().nullable(),
  actor_staff_user_id: z.string().uuid(),
  occurred_at: z.string().datetime({ offset: true }),
  notes: z.string().nullable(),
});

export type GirviCustodyEvent = z.infer<typeof girviCustodyEventSchema>;

export const girviFinancialEventSchema = z.object({
  id: z.string().uuid(),
  event_type: girviFinancialEventTypeSchema,
  effective_business_date: businessDateSchema,
  principal_delta_inr: signedMoneyAmountSchema,
  interest_delta_inr: signedMoneyAmountSchema,
  amount_inr: moneyAmountSchema,
  method: paymentMethodSchema.nullable(),
  notes: z.string().nullable(),
  /** Deterministic order for several events on the same business date. */
  posting_sequence: z.number().int().positive(),
  actor_staff_user_id: z.string().uuid(),
  event_key: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
});

export type GirviFinancialEvent = z.infer<typeof girviFinancialEventSchema>;

/** Physical handover. Separate row, separate permission, and never an inventory movement. */
export const girviReleaseEventSchema = z.object({
  id: z.string().uuid(),
  girvi_account_id: z.string().uuid(),
  settlement_event_id: z.string().uuid().nullable(),
  packet_numbers_verified: z.array(z.string().min(1)).min(1),
  staff_acknowledged_by: z.string().uuid(),
  customer_acknowledged: z.boolean(),
  recipient_name: z.string().min(1),
  waiver_reason: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export type GirviReleaseEvent = z.infer<typeof girviReleaseEventSchema>;

export const girviAccountListItemSchema = z.object({
  id: z.string().uuid(),
  account_number: z.string().min(1),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  status: girviAccountStatusSchema,
  /** Derived presentation only; never means jewellery became shop stock. */
  is_overdue: z.boolean(),
  principal_inr: moneyAmountSchema,
  /** Projection rebuilt from posted events inside the same transaction. */
  principal_outstanding_inr: moneyAmountSchema,
  interest_outstanding_inr: moneyAmountSchema,
  start_business_date: businessDateSchema,
  maturity_business_date: businessDateSchema,
  collateral_count: z.number().int().nonnegative(),
  activated_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export type GirviAccountListItem = z.infer<typeof girviAccountListItemSchema>;

export const GIRVI_ACCOUNT_SORT_FIELDS = ["created_at", "maturity_business_date", "account_number", "principal_inr"] as const;

export const girviAccountListQuerySchema = paginationQuerySchema
  .extend({
    status: girviAccountStatusSchema.optional(),
    customer_id: z.string().uuid().optional(),
    maturity_from: businessDateSchema.optional(),
    maturity_to: businessDateSchema.optional(),
    /** When true, only active accounts past maturity (Kolkata business date). Omit for All. */
    is_overdue: z
      .enum(["true"])
      .optional()
      .transform((value) => (value === undefined ? undefined : true)),
    q: z.string().trim().min(1).max(120).optional(),
    sort: z.enum(GIRVI_ACCOUNT_SORT_FIELDS).default("created_at"),
    direction: paginationDirectionSchema.default("desc"),
  })
  .strict();

export type GirviAccountListQuery = z.infer<typeof girviAccountListQuerySchema>;

export const girviAccountListSchema = paginatedResponseSchema(girviAccountListItemSchema, GIRVI_ACCOUNT_SORT_FIELDS);
export type GirviAccountList = z.infer<typeof girviAccountListSchema>;

export const girviAccountSchema = z.object({
  id: z.string().uuid(),
  account_number: z.string().min(1),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  status: girviAccountStatusSchema,
  is_overdue: z.boolean(),
  principal_inr: moneyAmountSchema,
  principal_outstanding_inr: moneyAmountSchema,
  interest_outstanding_inr: moneyAmountSchema,
  start_business_date: businessDateSchema,
  maturity_business_date: businessDateSchema,
  terms_snapshot: girviTermsSnapshotSchema,
  calculation_policy_version: z.string().nullable(),
  activated_at: z.string().datetime({ offset: true }).nullable(),
  activated_by_staff_user_id: z.string().uuid().nullable(),
  settled_at: z.string().datetime({ offset: true }).nullable(),
  settled_by_staff_user_id: z.string().uuid().nullable(),
  released_at: z.string().datetime({ offset: true }).nullable(),
  released_by_staff_user_id: z.string().uuid().nullable(),
  row_version: z.number().int().positive(),
  collateral: z.array(girviCollateralItemSchema),
  custody_events: z.array(girviCustodyEventSchema),
  financial_events: z.array(girviFinancialEventSchema),
  release_events: z.array(girviReleaseEventSchema),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type GirviAccount = z.infer<typeof girviAccountSchema>;

export const girviAccountCreateSchema = z
  .object({
    customer_id: z.string().uuid(),
    principal_inr: positiveMoneyAmountSchema,
    /** Percentage per 30 days. Required so activation can freeze approved terms. */
    interest_rate_percent_per_30_days: interestRatePercentSchema,
    start_business_date: businessDateSchema,
    maturity_business_date: businessDateSchema,
    collateral: z.array(girviCollateralItemInputSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.maturity_business_date < value.start_business_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maturity_business_date"],
        message: "Maturity must be on or after the start date.",
      });
    }
  });

export type GirviAccountCreate = z.infer<typeof girviAccountCreateSchema>;

export const girviAccountPatchSchema = z
  .object({
    row_version: z.number().int().positive(),
    principal_inr: positiveMoneyAmountSchema.optional(),
    interest_rate_percent_per_30_days: interestRatePercentSchema.optional(),
    start_business_date: businessDateSchema.optional(),
    maturity_business_date: businessDateSchema.optional(),
    collateral: z.array(girviCollateralItemInputSchema).min(1).max(50).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.start_business_date &&
      value.maturity_business_date &&
      value.maturity_business_date < value.start_business_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maturity_business_date"],
        message: "Maturity must be on or after the start date.",
      });
    }
  });

export type GirviAccountPatch = z.infer<typeof girviAccountPatchSchema>;

export const girviAccountActivateSchema = z
  .object({
    row_version: z.number().int().positive(),
    confirm_principal_inr: positiveMoneyAmountSchema,
    confirm_packet_numbers: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export type GirviAccountActivate = z.infer<typeof girviAccountActivateSchema>;

export const girviAccrualSegmentSchema = z.object({
  from_business_date: businessDateSchema,
  to_business_date: businessDateSchema,
  days: z.number().int().positive(),
  principal_inr: moneyAmountSchema,
  interest_inr: moneyAmountSchema,
});

export type GirviAccrualSegment = z.infer<typeof girviAccrualSegmentSchema>;

/** Read-only. Producing a statement never posts interest and never changes a balance. */
export const girviStatementSchema = z.object({
  girvi_account_id: z.string().uuid(),
  account_number: z.string().min(1),
  status: girviAccountStatusSchema,
  policy_version: z.string().min(1),
  rate_percent_per_30_days: interestRatePercentSchema,
  /** Visible label beside the rate on screens and the agreement. */
  rate_period_label: z.literal("per 30 days"),
  start_business_date: businessDateSchema,
  maturity_business_date: businessDateSchema,
  as_of_business_date: businessDateSchema,
  is_overdue: z.boolean(),
  principal_outstanding_inr: moneyAmountSchema,
  interest_outstanding_inr: moneyAmountSchema,
  payoff_inr: moneyAmountSchema,
  principal_recovered_inr: moneyAmountSchema,
  interest_received_inr: moneyAmountSchema,
  principal_waived_inr: moneyAmountSchema,
  interest_waived_inr: moneyAmountSchema,
  accrual_segments: z.array(girviAccrualSegmentSchema),
});

export type GirviStatementDto = z.infer<typeof girviStatementSchema>;

export const girviStatementQuerySchema = z
  .object({
    as_of: businessDateSchema.optional(),
  })
  .strict();

export type GirviStatementQuery = z.infer<typeof girviStatementQuerySchema>;

export const girviRepaymentCreateSchema = z
  .object({
    business_date: businessDateSchema,
    amount_inr: positiveMoneyAmountSchema,
    method: paymentMethodSchema,
    /** Server-calculated split the staff member confirmed; a changed split is rejected. */
    confirm_interest_paid_inr: moneyAmountSchema,
    confirm_principal_paid_inr: moneyAmountSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type GirviRepaymentCreate = z.infer<typeof girviRepaymentCreateSchema>;

export const girviRepaymentAllocationSchema = z.object({
  financial_event_id: z.string().uuid(),
  business_date: businessDateSchema,
  method: paymentMethodSchema,
  amount_inr: moneyAmountSchema,
  interest_paid_inr: moneyAmountSchema,
  principal_paid_inr: moneyAmountSchema,
  interest_outstanding_inr: moneyAmountSchema,
  principal_outstanding_inr: moneyAmountSchema,
  payoff_inr: moneyAmountSchema,
  clears_account: z.boolean(),
});

export type GirviRepaymentAllocationDto = z.infer<typeof girviRepaymentAllocationSchema>;

export const girviRepaymentResultSchema = z.object({
  account: girviAccountSchema,
  allocation: girviRepaymentAllocationSchema,
});

export type GirviRepaymentResult = z.infer<typeof girviRepaymentResultSchema>;

export const girviSettlementQuoteRequestSchema = z
  .object({
    business_date: businessDateSchema.optional(),
  })
  .strict();

export type GirviSettlementQuoteRequest = z.infer<typeof girviSettlementQuoteRequestSchema>;

export const girviSettlementQuoteSchema = z.object({
  girvi_account_id: z.string().uuid(),
  business_date: businessDateSchema,
  principal_outstanding_inr: moneyAmountSchema,
  interest_outstanding_inr: moneyAmountSchema,
  payoff_inr: moneyAmountSchema,
  rate_percent_per_30_days: interestRatePercentSchema,
  rate_period_label: z.literal("per 30 days"),
  /** Recalculate if the business date or the account ledger changes before posting. */
  quoted_at: z.string().datetime({ offset: true }),
});

export type GirviSettlementQuote = z.infer<typeof girviSettlementQuoteSchema>;

export const girviSettlementCreateSchema = z
  .object({
    business_date: businessDateSchema,
    confirm_payoff_inr: moneyAmountSchema,
    amount_inr: moneyAmountSchema,
    method: paymentMethodSchema.optional(),
    /** Authorized write-off of the remainder. Owner or admin only. */
    waiver_inr: moneyAmountSchema.optional(),
    waiver_reason: z.string().trim().min(5).max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type GirviSettlementCreate = z.infer<typeof girviSettlementCreateSchema>;

export const girviSettlementResultSchema = z.object({
  account: girviAccountSchema,
  settlement: z.object({
    financial_event_id: z.string().uuid().nullable(),
    waiver_event_id: z.string().uuid().nullable(),
    business_date: businessDateSchema,
    amount_inr: moneyAmountSchema,
    interest_paid_inr: moneyAmountSchema,
    principal_paid_inr: moneyAmountSchema,
    waiver_inr: moneyAmountSchema,
    /** Settled accounts keep their packets in custody until a separate release. */
    collateral_still_in_custody: z.literal(true),
  }),
});

export type GirviSettlementResult = z.infer<typeof girviSettlementResultSchema>;

export const girviReleaseCreateSchema = z
  .object({
    verify_packet_numbers: z.array(z.string().trim().min(1)).min(1),
    recipient_name: z.string().trim().min(1).max(200),
    customer_acknowledged: z.literal(true),
    waiver_reason: z.string().trim().min(5).max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type GirviReleaseCreate = z.infer<typeof girviReleaseCreateSchema>;

export const girviReleaseResultSchema = z.object({
  account: girviAccountSchema,
  release: girviReleaseEventSchema,
});

export type GirviReleaseResult = z.infer<typeof girviReleaseResultSchema>;

export const girviDraftDeleteQuerySchema = z
  .object({
    row_version: z.coerce.number().int().positive(),
  })
  .strict();

export type GirviDraftDeleteQuery = z.infer<typeof girviDraftDeleteQuerySchema>;

export const girviCollateralFileUploadQuerySchema = z
  .object({
    purpose: girviCollateralFilePurposeSchema.default("collateral_photo"),
  })
  .strict();

export type GirviCollateralFileUploadQuery = z.infer<typeof girviCollateralFileUploadQuerySchema>;

/** Move a sealed packet to a different custody location. Not an inventory movement. */
export const girviCustodyMoveCreateSchema = z
  .object({
    collateral_item_id: z.string().uuid(),
    custody_location: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type GirviCustodyMoveCreate = z.infer<typeof girviCustodyMoveCreateSchema>;

export const girviCustodyMoveResultSchema = z.object({
  account: girviAccountSchema,
  custody_event: girviCustodyEventSchema,
});

export type GirviCustodyMoveResult = z.infer<typeof girviCustodyMoveResultSchema>;
