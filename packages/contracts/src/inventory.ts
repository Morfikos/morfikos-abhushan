import { z } from "zod";

import { paginatedResponseSchema } from "./pagination";
import { businessDateSchema, metalSchema } from "./shop";

export const articleStatusSchema = z.enum(["available", "sold", "return_inspection", "unavailable"]);
export const inventoryMovementTypeSchema = z.enum([
  "receipt",
  "sale",
  "return_in",
  "inspection_release",
  "adjustment",
]);
export const stockCountLineStatusSchema = z.enum(["available", "unavailable", "missing"]);
export const articlePhotoContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export type ArticleStatus = z.infer<typeof articleStatusSchema>;
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type StockCountLineStatus = z.infer<typeof stockCountLineStatusSchema>;
export type ArticlePhotoContentType = z.infer<typeof articlePhotoContentTypeSchema>;

const weightGramsSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Use a decimal string with at most 4 fractional digits.");

const positiveWeightGramsSchema = weightGramsSchema.refine(
  (value) => !/^0+(\.0+)?$/.test(value),
  "Weight must be greater than zero.",
);

const moneyInrSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a decimal string with at most 2 fractional digits.");

export const ARTICLE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const catalogueCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  default_metal: metalSchema.nullable(),
  is_active: z.boolean(),
});

export const catalogueCategoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    default_metal: metalSchema.optional(),
  })
  .strict();

export const catalogueCategoryListSchema = z.object({
  items: z.array(catalogueCategorySchema),
});

export const storageLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  branch_id: z.string().uuid(),
  is_active: z.boolean(),
});

export const storageLocationCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const storageLocationPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.is_active !== undefined, {
    message: "Provide a name and/or is_active.",
  });

export const storageLocationListSchema = z.object({
  items: z.array(storageLocationSchema),
});

export const storageLocationListQuerySchema = z.object({
  include_inactive: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
});

export const purityLabelSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

export const purityLabelCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    sort_order: z.number().int().optional(),
  })
  .strict();

export const purityLabelPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(40).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().optional(),
  })
  .strict()
  .refine(
    (value) => value.label !== undefined || value.is_active !== undefined || value.sort_order !== undefined,
    { message: "Provide label, is_active, and/or sort_order." },
  );

export const purityLabelListSchema = z.object({
  items: z.array(purityLabelSchema),
});

export const purityLabelListQuerySchema = z.object({
  include_inactive: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
});

export const articleStoneSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1),
  weight_grams: z.string().nullable(),
});

export const articleStoneInputSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    weight_grams: weightGramsSchema.optional(),
  })
  .strict();

export const articleFileSchema = z.object({
  id: z.string().uuid(),
  object_key: z.string().min(1),
  checksum_sha256: z.string().min(1),
  content_type: articlePhotoContentTypeSchema,
  original_filename: z.string().min(1),
  byte_size: z.number().int().positive(),
});

export const articlePhotographInputSchema = z
  .object({
    original_filename: z.string().trim().min(1).max(200),
    content_type: articlePhotoContentTypeSchema,
    byte_size: z.number().int().positive().max(ARTICLE_PHOTO_MAX_BYTES),
    checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/, "Use a lowercase SHA-256 hex digest."),
  })
  .strict();

export const articleListItemSchema = z.object({
  id: z.string().uuid(),
  article_number: z.string().min(1),
  barcode: z.string().nullable(),
  category_id: z.string().uuid(),
  category_name: z.string().min(1),
  metal: metalSchema,
  purity: z.string().min(1),
  gross_weight_grams: z.string(),
  non_metal_weight_grams: z.string(),
  net_metal_weight_grams: z.string(),
  location_id: z.string().uuid().nullable(),
  location_name: z.string().nullable(),
  status: articleStatusSchema,
  sellable: z.boolean(),
  deletable: z.boolean(),
  receipt_business_date: businessDateSchema,
  row_version: z.number().int().positive(),
});

export const articleSchema = articleListItemSchema.extend({
  huid: z.string().nullable(),
  supplier_ref: z.string().nullable(),
  karigar_ref: z.string().nullable(),
  acquisition_cost_inr: z.string().nullable(),
  stones: z.array(articleStoneSchema),
  files: z.array(articleFileSchema),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const articleCreateSchema = z
  .object({
    category_id: z.string().uuid(),
    metal: metalSchema,
    purity: z.string().trim().min(1).max(40),
    gross_weight_grams: positiveWeightGramsSchema,
    non_metal_weight_grams: weightGramsSchema.default("0"),
    net_metal_weight_grams: positiveWeightGramsSchema,
    huid: z.string().trim().max(40).nullable().optional(),
    supplier_ref: z.string().trim().max(80).nullable().optional(),
    karigar_ref: z.string().trim().max(80).nullable().optional(),
    receipt_business_date: businessDateSchema.optional(),
    acquisition_cost_inr: moneyInrSchema.nullable().optional(),
    location_id: z.string().uuid().nullable().optional(),
    stones: z.array(articleStoneInputSchema).max(20).optional(),
    photograph: articlePhotographInputSchema.optional(),
  })
  .strict();

export const articlePatchSchema = z
  .object({
    row_version: z.number().int().positive(),
    category_id: z.string().uuid().optional(),
    metal: metalSchema.optional(),
    purity: z.string().trim().min(1).max(40).optional(),
    gross_weight_grams: positiveWeightGramsSchema.optional(),
    non_metal_weight_grams: weightGramsSchema.optional(),
    net_metal_weight_grams: positiveWeightGramsSchema.optional(),
    huid: z.string().trim().max(40).nullable().optional(),
    supplier_ref: z.string().trim().max(80).nullable().optional(),
    karigar_ref: z.string().trim().max(80).nullable().optional(),
    location_id: z.string().uuid().nullable().optional(),
    photograph: articlePhotographInputSchema.optional(),
  })
  .strict();

export const articleAdjustmentSchema = z
  .object({
    row_version: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500),
    to_status: z.enum(["available", "unavailable"]).optional(),
    location_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const articleInspectionReleaseSchema = z
  .object({
    row_version: z.number().int().positive(),
    to_status: z.enum(["available", "unavailable"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const ARTICLE_SORT_FIELDS = [
  "created_at",
  "article_number",
  "status",
  "gross_weight_grams",
  "receipt_business_date",
] as const;

export const articleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(ARTICLE_SORT_FIELDS).default("created_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  article_number: z.string().trim().max(40).optional(),
  category_id: z.string().uuid().optional(),
  metal: metalSchema.optional(),
  purity: z.string().trim().max(40).optional(),
  status: articleStatusSchema.optional(),
  min_gross_weight_grams: weightGramsSchema.optional(),
  max_gross_weight_grams: weightGramsSchema.optional(),
});

export const articleListSchema = paginatedResponseSchema(articleListItemSchema, ARTICLE_SORT_FIELDS);

export const articleBulkDeleteSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();

export const articleDeleteSkipSchema = z.object({
  id: z.string().uuid(),
  article_number: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const articleBulkDeleteResultSchema = z.object({
  deleted_ids: z.array(z.string().uuid()),
  skipped: z.array(articleDeleteSkipSchema),
});

export const articleLookupQuerySchema = z.object({
  barcode: z.string().trim().min(1).max(80),
  for_sale: z.enum(["true", "false"]).optional(),
});

export const inventoryMovementSchema = z.object({
  id: z.string().uuid(),
  article_id: z.string().uuid(),
  movement_type: inventoryMovementTypeSchema,
  from_status: articleStatusSchema.nullable(),
  to_status: articleStatusSchema.nullable(),
  reason: z.string().nullable(),
  actor_staff_user_id: z.string().uuid(),
  related_invoice_id: z.string().uuid().nullable(),
  related_return_id: z.string().uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export const inventoryMovementListSchema = z.object({
  items: z.array(inventoryMovementSchema),
});

export const stockCountLineInputSchema = z
  .object({
    article_id: z.string().uuid(),
    counted_status: stockCountLineStatusSchema,
  })
  .strict();

export const stockCountCreateSchema = z
  .object({
    counted_on: businessDateSchema,
    notes: z.string().trim().max(500).optional(),
    lines: z.array(stockCountLineInputSchema).min(1).max(500),
  })
  .strict();

export const stockCountLineSchema = z.object({
  article_id: z.string().uuid(),
  article_number: z.string().min(1),
  expected_status: articleStatusSchema,
  counted_status: stockCountLineStatusSchema,
  has_discrepancy: z.boolean(),
});

export const stockCountSchema = z.object({
  id: z.string().uuid(),
  counted_on: businessDateSchema,
  status: z.literal("reviewed"),
  notes: z.string().nullable(),
  actor_staff_user_id: z.string().uuid(),
  lines: z.array(stockCountLineSchema),
  created_at: z.string().datetime({ offset: true }),
});

export const tagPrintKindSchema = z.enum(["initial", "reprint", "batch"]);

export const articleBarcodeBatchSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict();

export const articleBarcodeBatchResultSchema = z.object({
  items: z.array(articleSchema),
});

export const tagPrintCreateSchema = z
  .object({
    print_kind: tagPrintKindSchema,
    reason: z.string().trim().max(500).optional(),
    template_version: z.string().trim().min(1).max(40),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.print_kind === "reprint" && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reason is required to reprint a tag.",
        path: ["reason"],
      });
    }
  });

export const tagPrintEventSchema = z.object({
  id: z.string().uuid(),
  article_id: z.string().uuid(),
  barcode: z.string().min(1),
  print_kind: tagPrintKindSchema,
  reason: z.string().nullable(),
  template_version: z.string().min(1),
  actor_staff_user_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});

export const tagPreviewSchema = z.object({
  article_id: z.string().uuid(),
  article_number: z.string().min(1),
  barcode: z.string().min(1),
  metal: metalSchema,
  purity: z.string().min(1),
  gross_weight_grams: z.string(),
  net_metal_weight_grams: z.string(),
  tag_width_mm: z.string(),
  tag_height_mm: z.string(),
  template_version: z.string().min(1),
  barcode_svg: z.string().min(1),
  barcode_height_mm: z.string(),
  legal_name: z.string().min(1),
  /** Embedded for print; null when absent or omitted for height. */
  logo_data_uri: z.string().nullable(),
  logo_omitted_for_height: z.boolean(),
  hardware_validated: z.literal(false),
});

export type CatalogueCategory = z.infer<typeof catalogueCategorySchema>;
export type CatalogueCategoryCreate = z.infer<typeof catalogueCategoryCreateSchema>;
export type CatalogueCategoryList = z.infer<typeof catalogueCategoryListSchema>;
export type StorageLocation = z.infer<typeof storageLocationSchema>;
export type StorageLocationCreate = z.infer<typeof storageLocationCreateSchema>;
export type StorageLocationPatch = z.infer<typeof storageLocationPatchSchema>;
export type StorageLocationList = z.infer<typeof storageLocationListSchema>;
export type PurityLabel = z.infer<typeof purityLabelSchema>;
export type PurityLabelCreate = z.infer<typeof purityLabelCreateSchema>;
export type PurityLabelPatch = z.infer<typeof purityLabelPatchSchema>;
export type PurityLabelList = z.infer<typeof purityLabelListSchema>;
export type ArticleStone = z.infer<typeof articleStoneSchema>;
export type ArticleStoneInput = z.infer<typeof articleStoneInputSchema>;
export type ArticleFile = z.infer<typeof articleFileSchema>;
export type ArticlePhotographInput = z.infer<typeof articlePhotographInputSchema>;
export type ArticleListItem = z.infer<typeof articleListItemSchema>;
export type Article = z.infer<typeof articleSchema>;
export type ArticleCreate = z.infer<typeof articleCreateSchema>;
export type ArticlePatch = z.infer<typeof articlePatchSchema>;
export type ArticleAdjustment = z.infer<typeof articleAdjustmentSchema>;
export type ArticleInspectionRelease = z.infer<typeof articleInspectionReleaseSchema>;
export type ArticleList = z.infer<typeof articleListSchema>;
export type ArticleBulkDelete = z.infer<typeof articleBulkDeleteSchema>;
export type ArticleBulkDeleteResult = z.infer<typeof articleBulkDeleteResultSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export type InventoryMovementList = z.infer<typeof inventoryMovementListSchema>;
export type StockCountCreate = z.infer<typeof stockCountCreateSchema>;
export type StockCount = z.infer<typeof stockCountSchema>;
export type TagPrintKind = z.infer<typeof tagPrintKindSchema>;
export type ArticleBarcodeBatch = z.infer<typeof articleBarcodeBatchSchema>;
export type ArticleBarcodeBatchResult = z.infer<typeof articleBarcodeBatchResultSchema>;
export type TagPrintCreate = z.infer<typeof tagPrintCreateSchema>;
export type TagPrintEvent = z.infer<typeof tagPrintEventSchema>;
export type TagPreview = z.infer<typeof tagPreviewSchema>;
