import { z } from "zod";

export const emailOtpRequestSchema = z.object({ email: z.string().trim().email().max(254) });
export const emailOtpVerifySchema = emailOtpRequestSchema.extend({ token: z.string().trim().min(6).max(12) });
export const createBusinessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  language: z.enum(["en", "hi", "hinglish"]).default("en"),
});

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const paiseSchema = z.string().regex(/^(0|[1-9]\d{0,18})$/).refine((value) => BigInt(value) <= 9223372036854775807n, "Amount is out of range");
const quantitySchema = z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/).refine((value) => Number(value) > 0, "Quantity must be positive");

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1).max(120), phone: optionalText(32), address: optionalText(500),
  preferredLanguage: z.enum(["en", "hi", "hinglish"]).default("en"),
});
export const clientUpdateSchema = clientCreateSchema.partial().refine((value) => Object.keys(value).length > 0);
export const inventoryCreateSchema = z.object({
  itemName: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(24),
  lowStockThreshold: z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/).default("0"),
  pricePerUnitPaise: paiseSchema.default("0"),
});
export const inventoryUpdateSchema = inventoryCreateSchema.partial().refine((value) => Object.keys(value).length > 0);
export const stockAdjustSchema = z.object({ itemName: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(24), delta: z.string().regex(/^-?(0|[1-9]\d{0,8})(\.\d{1,3})?$/).refine((value) => Number(value) !== 0) });
const itemSchema = z.object({ name: z.string().trim().min(1).max(120), unit: z.string().trim().min(1).max(24), qty: quantitySchema, pricePaise: paiseSchema });
export const saleSchema = z.object({ clientId: z.string().uuid(), items: z.array(itemSchema).min(1).max(100), paidNowPaise: paiseSchema.default("0") });
export const paymentSchema = z.object({ clientId: z.string().uuid(), amountPaise: paiseSchema.refine((value) => BigInt(value) > 0n), method: z.enum(["CASH", "UPI_MOCK", "UPI", "OTHER"]) });
export const invoiceCreateSchema = z.object({
  clientId: z.string().uuid(), items: z.array(itemSchema).min(1).max(100),
  dueDate: z.string().date().nullable().optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
