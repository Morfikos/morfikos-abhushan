import { z } from "zod";

export const paginationDirectionSchema = z.enum(["asc", "desc"]);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().min(1),
  direction: paginationDirectionSchema.default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T, sortFields: readonly [string, ...string[]]) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().min(1),
    page_size: z.number().int().min(1),
    total: z.number().int().min(0),
    sort: z.enum(sortFields),
    direction: paginationDirectionSchema,
  });
}
