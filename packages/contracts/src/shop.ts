import { z } from "zod";

import { paginatedResponseSchema } from "./pagination";

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a decimal string with at most 6 fractional digits.")
  .refine((value) => Number.parseInt(value.split(".")[0] ?? "0", 10) >= 0, "Rate must be a non-negative decimal string.");

export const metalSchema = z.enum(["gold", "silver"]);
export const documentTypeSchema = z.enum(["invoice", "receipt", "girvi_account", "article"]);
export const scanTerminatorSchema = z.enum(["Enter", "Tab", "None"]);
export const invoicePaperSizeSchema = z.enum(["A4", "A5", "80mm"]);
export const reminderLanguageSchema = z.enum(["en", "hi"]);
export const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO calendar date (YYYY-MM-DD).");
export const localTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a local time (HH:MM).");

export type Metal = z.infer<typeof metalSchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type ScanTerminator = z.infer<typeof scanTerminatorSchema>;
export type InvoicePaperSize = z.infer<typeof invoicePaperSizeSchema>;
export type ReminderLanguage = z.infer<typeof reminderLanguageSchema>;

export const shopProfileSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  legal_name: z.string().min(1),
  address_line: z.string().nullable(),
  phone: z.string().nullable(),
  invoice_footer: z.string().nullable(),
  /** Short-lived signed URL; never persist. Null when no logo is stored. */
  logo_url: z.string().url().nullable(),
  has_logo: z.boolean(),
  time_zone: z.literal("Asia/Kolkata"),
  branch: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    address_line: z.string().nullable(),
    is_active: z.boolean(),
  }),
});

export const shopBrandingPublicSchema = z.object({
  legal_name: z.string().min(1),
  logo_url: z.string().url().nullable(),
});

export const shopProfilePatchSchema = z
  .object({
    legal_name: z.string().trim().min(1).max(200).optional(),
    address_line: z.string().trim().max(500).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    invoice_footer: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const metalRateSchema = z.object({
  id: z.string().uuid(),
  metal: metalSchema,
  purity: z.string().min(1),
  rate_per_gram: z.string(),
  effective_business_date: businessDateSchema,
  created_by_staff_user_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});

export const metalRateCreateSchema = z
  .object({
    metal: metalSchema,
    purity: z.string().trim().min(1).max(40),
    rate_per_gram: decimalString.refine((value) => value !== "0" && !/^0+(\.0+)?$/.test(value), "Rate per gram must be greater than zero."),
    effective_business_date: businessDateSchema.optional(),
  })
  .strict();

export const METAL_RATE_SORT_FIELDS = ["effective_business_date", "metal", "purity", "created_at"] as const;
export const metalRateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(METAL_RATE_SORT_FIELDS).default("effective_business_date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const metalRateListSchema = paginatedResponseSchema(metalRateSchema, METAL_RATE_SORT_FIELDS);

export const documentSequenceSchema = z.object({
  document_type: documentTypeSchema,
  prefix: z.string().min(1).max(12),
  padding: z.number().int().min(1).max(12),
  next_value: z.number().int().min(1),
});

export const documentSequencesSchema = z.object({
  items: z.array(documentSequenceSchema),
});

export const documentSequencesPatchSchema = z
  .object({
    items: z.array(
      z.object({
        document_type: documentTypeSchema,
        prefix: z.string().trim().min(1).max(12),
        padding: z.number().int().min(1).max(12),
        next_value: z.number().int().min(1),
      }),
    ),
  })
  .strict();

export const deviceSettingsSchema = z.object({
  scan_terminator: scanTerminatorSchema,
  expected_suffix: z.string(),
  tag_width_mm: z.string(),
  tag_height_mm: z.string(),
  invoice_paper_size: invoicePaperSizeSchema,
  hardware_validated: z.literal(false),
});

export const deviceSettingsPatchSchema = z
  .object({
    scan_terminator: scanTerminatorSchema.optional(),
    expected_suffix: z.string().max(16).optional(),
    tag_width_mm: decimalString.optional(),
    tag_height_mm: decimalString.optional(),
    invoice_paper_size: invoicePaperSizeSchema.optional(),
  })
  .strict();

export const reminderSettingsSchema = z.object({
  girvi_reminders_enabled: z.boolean(),
  invoice_due_reminders_enabled: z.boolean(),
  send_window_start: localTimeSchema,
  send_window_end: localTimeSchema,
  language: reminderLanguageSchema,
});

export const reminderSettingsPatchSchema = reminderSettingsSchema.partial().strict();

export type ShopProfile = z.infer<typeof shopProfileSchema>;
export type ShopProfilePatch = z.infer<typeof shopProfilePatchSchema>;
export type ShopBrandingPublic = z.infer<typeof shopBrandingPublicSchema>;
export type MetalRate = z.infer<typeof metalRateSchema>;
export type MetalRateCreate = z.infer<typeof metalRateCreateSchema>;
export type MetalRateList = z.infer<typeof metalRateListSchema>;
export type DocumentSequence = z.infer<typeof documentSequenceSchema>;
export type DocumentSequences = z.infer<typeof documentSequencesSchema>;
export type DocumentSequencesPatch = z.infer<typeof documentSequencesPatchSchema>;
export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;
export type DeviceSettingsPatch = z.infer<typeof deviceSettingsPatchSchema>;
export type ReminderSettings = z.infer<typeof reminderSettingsSchema>;
export type ReminderSettingsPatch = z.infer<typeof reminderSettingsPatchSchema>;
