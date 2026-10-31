import { z } from "zod";

const actionItemSchema = z.object({
  name: z.string().trim().max(120),
  quantity: z.string().max(24),
  unit: z.string().trim().max(24),
});

export const actionUnitSchema = z.object({
  intent: z.enum(["ADD_SALE", "UPDATE_STOCK", "MARK_PAID", "QUERY_LEDGER", "QUERY_STOCK", "GENERATE_REPORT", "GENERATE_INVOICE", "ADD_CLIENT", "SEND_REMINDER", "UNKNOWN"]),
  clientName: z.string().trim().max(120).nullable(),
  items: z.array(actionItemSchema).max(20),
  amountRupees: z.string().max(24).nullable(),
  stockDelta: z.string().max(24).nullable(),
  phone: z.string().max(32).nullable(),
  dueDate: z.string().date().nullable(),
});

export const parsedCommandSchema = z.object({
  actions: z.array(actionUnitSchema).min(1).max(4),
  reply: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(240),
  confidence: z.number().min(0).max(1),
  requiresConfirmation: z.boolean(),
});
export const chatRequestSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export type ActionUnit = z.infer<typeof actionUnitSchema>;
export type ParsedCommand = z.infer<typeof parsedCommandSchema>;
