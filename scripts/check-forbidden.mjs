import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["apps/api/src", "packages/shared/src"];
const terms = ["wal" + "let", "n" + "ft", "block" + "chain", "eth" + "ers", "us" + "dc", "x" + "402", "hard" + "hat", "meta" + "mask", "gem" + "ini"];

export function hasForbiddenTerm(contents) {
  return terms.some((term) => contents.toLowerCase().includes(term));
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }));
  return files.flat();
}

const violations = [];
for (const root of roots) {
  try {
    for (const file of await filesUnder(root)) {
      const contents = await readFile(file, "utf8");
      if (hasForbiddenTerm(contents)) violations.push(file);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

if (violations.length) {
  console.error(`Forbidden terms found in: ${violations.join(", ")}`);
  process.exitCode = 1;
}
