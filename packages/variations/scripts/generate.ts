import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRegistryData } from "./render-registry-data.ts";

const TARGET = fileURLToPath(new URL("../src/generated/registry-data.ts", import.meta.url));

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, await renderRegistryData());
console.log(`variations: wrote ${TARGET}`);
