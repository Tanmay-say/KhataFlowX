import { expect, it } from "vitest";
import { parseDatabaseJson } from "./database.js";

it("keeps paise fields as exact strings at every size", () => {
  expect(parseDatabaseJson('{"balance_paise":123,"nested":{"totalPaise":1234567890123456789}}')).toEqual({
    balance_paise: "123", nested: { totalPaise: "1234567890123456789" },
  });
});
