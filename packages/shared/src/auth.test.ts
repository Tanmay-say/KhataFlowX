import { describe, expect, it } from "vitest";
import {
  clientUpdateSchema, createBusinessSchema, emailOtpRequestSchema, emailOtpVerifySchema,
  inventoryCreateSchema, saleSchema,
} from "./auth.js";

describe("auth and onboarding inputs", () => {
  it("normalizes email and rejects malformed addresses", () => {
    expect(emailOtpRequestSchema.parse({ email: " shop@example.com " }).email).toBe("shop@example.com");
    expect(emailOtpRequestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("bounds OTP length", () => {
    expect(emailOtpVerifySchema.safeParse({ email: "shop@example.com", token: "123456" }).success).toBe(true);
    expect(emailOtpVerifySchema.safeParse({ email: "shop@example.com", token: "1" }).success).toBe(false);
  });

  it("trims business names and defaults language", () => {
    expect(createBusinessSchema.parse({ name: "  Kirana  " })).toEqual({ name: "Kirana", language: "en" });
    expect(createBusinessSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createBusinessSchema.safeParse({ name: "Shop", language: "fr" }).success).toBe(false);
  });

  it("requires paise strings and rejects values outside PostgreSQL bigint", () => {
    expect(saleSchema.safeParse({ clientId: "00000000-0000-4000-8000-000000000001", items: [{ name: "Dal", unit: "kg", qty: "1.25", pricePaise: "9999999999999999999" }] }).success).toBe(false);
    expect(saleSchema.safeParse({ clientId: "00000000-0000-4000-8000-000000000001", items: [{ name: "Dal", unit: "kg", qty: "1.25", pricePaise: "100" }] }).success).toBe(true);
    expect(inventoryCreateSchema.parse({ itemName: "Atta", unit: "kg" }).lowStockThreshold).toBe("0");
  });

  it("rejects empty client updates", () => {
    expect(clientUpdateSchema.safeParse({}).success).toBe(false);
  });
});
