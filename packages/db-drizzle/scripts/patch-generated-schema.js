import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(scriptDir, "../src/generated/schema.ts");

async function ensureAuthStub() {
  const contents = await readFile(schemaPath, "utf-8");

  if (contents.includes('authUsers')) {
    return;
  }

const marker = 'import { sql } from "drizzle-orm"';
  const markerIndex = contents.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error("Unable to locate primary import block in generated schema");
  }

  const insertPos = contents.indexOf("\n", markerIndex) + 1;
  const stub =
    'import { usersInAuth } from "../schema/auth"\n\nexport { usersInAuth }\n\nconst users = usersInAuth\n\n';

  const updated = contents.slice(0, insertPos) + stub + contents.slice(insertPos);
  await writeFile(schemaPath, updated, "utf-8");
}

await ensureAuthStub();
