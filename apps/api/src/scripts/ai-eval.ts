import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
const { parseCommand } = await import("../services/ai/muse.js");

const cases = [
  ["Ramesh ko 2 kg atta udhaar likho", "ADD_SALE"],
  ["Pooja paid 500 rupees", "MARK_PAID"],
  ["atta ka stock 5 kilo badha do", "UPDATE_STOCK"],
  ["Suresh ka balance kya hai", "QUERY_LEDGER"],
  ["doodh kitna bacha hai", "QUERY_STOCK"],
  ["add 3 kg chawal to Ramesh's account", "ADD_SALE"],
  ["Raj ne 200 diye", "MARK_PAID"],
  ["dal stock 2 kg kam karo", "UPDATE_STOCK"],
  ["show my total outstanding report", "GENERATE_REPORT"],
  ["add new customer Meena", "ADD_CLIENT"],
  ["make an invoice for Ramesh for 1 kg sugar", "GENERATE_INVOICE"],
  ["Pooja ko payment reminder bhejo", "SEND_REMINDER"],
  ["Suresh bought 4 soap bars on credit", "ADD_SALE"],
  ["Vikram paid ₹1,250", "MARK_PAID"],
  ["inventory mein 10 litre tel add karo", "UPDATE_STOCK"],
  ["how much does Pooja owe me?", "QUERY_LEDGER"],
  ["check the remaining sugar stock", "QUERY_STOCK"],
  ["prepare an invoice for Meena, 2 kg dal", "GENERATE_INVOICE"],
  ["make a weekly outstanding report", "GENERATE_REPORT"],
  ["customer ka naam Asha hai, add her", "ADD_CLIENT"],
] as const;

let correct = 0;
for (const [text, expected] of cases) {
  const result = await parseCommand("Clients: Ramesh, Pooja, Suresh, Raj, Meena, Vikram, Asha. Inventory: atta kg, chawal kg, dal kg, doodh litre, sugar kg, soap piece, tel litre.", text);
  if (result.actions[0]?.intent === expected) correct++;
}
const accuracy = correct / cases.length;
process.stdout.write(`${JSON.stringify({ correct, total: cases.length, accuracy })}\n`);
if (accuracy < 0.9) process.exitCode = 1;
