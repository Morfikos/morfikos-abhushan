import { z } from "zod";

import { paginatedResponseSchema } from "./pagination";
import { reminderLanguageSchema } from "./shop";

export const customerConsentChannelSchema = z.literal("whatsapp");
export const customerConsentPurposeSchema = z.enum([
  "transactional_invoice",
  "transactional_receipt",
  "due_reminder",
  "girvi_reminder",
]);
export const customerConsentStatusSchema = z.enum(["granted", "revoked"]);

export type CustomerConsentChannel = z.infer<typeof customerConsentChannelSchema>;
export type CustomerConsentPurpose = z.infer<typeof customerConsentPurposeSchema>;
export type CustomerConsentStatus = z.infer<typeof customerConsentStatusSchema>;

export const customerConsentSchema = z.object({
  id: z.string().uuid(),
  channel: customerConsentChannelSchema,
  purpose: customerConsentPurposeSchema,
  status: customerConsentStatusSchema,
  granted_at: z.string().datetime({ offset: true }).nullable(),
  revoked_at: z.string().datetime({ offset: true }).nullable(),
  language: reminderLanguageSchema.nullable(),
});

export type CustomerConsent = z.infer<typeof customerConsentSchema>;

export const customerConsentWriteSchema = z
  .object({
    channel: customerConsentChannelSchema,
    purpose: customerConsentPurposeSchema,
    status: customerConsentStatusSchema,
    language: reminderLanguageSchema.optional(),
  })
  .strict();

export type CustomerConsentWrite = z.infer<typeof customerConsentWriteSchema>;

export const customerIdentityFileSchema = z.object({
  id: z.string().uuid(),
  object_key: z.string().min(1),
  checksum_sha256: z.string().min(1),
  uploaded_by_staff_user_id: z.string().uuid(),
  purpose: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
});

export type CustomerIdentityFile = z.infer<typeof customerIdentityFileSchema>;

export const customerIdentityFileListSchema = z.object({
  items: z.array(customerIdentityFileSchema),
});

export type CustomerIdentityFileList = z.infer<typeof customerIdentityFileListSchema>;

const emptyActivitySchema = z.object({
  items: z.array(z.never()),
  total: z.literal(0),
});

export const customerListItemSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  phone_normalized: z.string().nullable(),
  phone_display: z.string().nullable(),
  email: z.string().nullable(),
  is_active: z.boolean(),
  whatsapp_consent: customerConsentStatusSchema.nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export type CustomerListItem = z.infer<typeof customerListItemSchema>;

export const customerSchema = customerListItemSchema.extend({
  address_line: z.string().nullable(),
  notes: z.string().nullable(),
  updated_at: z.string().datetime({ offset: true }),
  consents: z.array(customerConsentSchema),
  sales: emptyActivitySchema,
  girvi: emptyActivitySchema,
  notifications: emptyActivitySchema,
});

export type Customer = z.infer<typeof customerSchema>;

export const customerCreateSchema = z
  .object({
    display_name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z
      .string()
      .trim()
      .max(254)
      .nullable()
      .optional()
      .refine(
        (value) => value === undefined || value === null || value.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value),
        "Enter a valid email address.",
      ),
    address_line: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    consents: z.array(customerConsentWriteSchema).max(8).optional(),
  })
  .strict();

export type CustomerCreate = z.infer<typeof customerCreateSchema>;

export const customerPatchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z
      .string()
      .trim()
      .max(254)
      .nullable()
      .optional()
      .refine(
        (value) => value === undefined || value === null || value.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value),
        "Enter a valid email address.",
      ),
    address_line: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export type CustomerPatch = z.infer<typeof customerPatchSchema>;

export const customerConsentsPutSchema = z
  .object({
    items: z.array(customerConsentWriteSchema).min(1).max(8),
  })
  .strict();

export type CustomerConsentsPut = z.infer<typeof customerConsentsPutSchema>;

export const customerConsentListSchema = z.object({
  items: z.array(customerConsentSchema),
});

export type CustomerConsentList = z.infer<typeof customerConsentListSchema>;

export const CUSTOMER_SORT_FIELDS = ["name", "created_at", "phone"] as const;

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(CUSTOMER_SORT_FIELDS).default("created_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(80).optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? true : value === "true")),
});

export const customerListSchema = paginatedResponseSchema(customerListItemSchema, CUSTOMER_SORT_FIELDS);

export type CustomerList = z.infer<typeof customerListSchema>;
