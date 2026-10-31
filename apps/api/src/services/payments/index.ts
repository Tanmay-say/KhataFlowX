import { env } from "../../config/env.js";

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
export interface PaymentProvider {
  name: "mock" | "paytm";
  createPayment(input: { paymentId: string; amountPaise: string; invoiceId?: string; clientId: string; returnUrl: string }): Promise<{ providerRef: string; checkoutUrl?: string; expiresAt: string }>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
  verifyWebhook(request: Request): Promise<{ providerRef: string; status: PaymentStatus; amountPaise: string; raw: unknown }>;
}

class MockProvider implements PaymentProvider {
  name = "mock" as const;
  async createPayment(input: { paymentId: string; returnUrl: string }) {
    return { providerRef: `mock:${input.paymentId}`, checkoutUrl: input.returnUrl, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }
  async getStatus() { return "PENDING" as const; }
  async verifyWebhook(): Promise<never> { throw new Error("Mock provider has no webhook"); }
}

export function getPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === "mock") return new MockProvider();
  throw new Error("Paytm provider is not configured yet");
}
