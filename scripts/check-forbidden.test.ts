import { expect, it } from "vitest";
import { hasForbiddenTerm } from "./check-forbidden.mjs";

it("detects disallowed terms without flagging the product name", () => {
  expect(hasForbiddenTerm("wallet")).toBe(true);
  expect(hasForbiddenTerm("KhataFlow merchant ledger")).toBe(false);
});
