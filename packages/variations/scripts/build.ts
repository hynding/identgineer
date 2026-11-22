import { fileURLToPath } from "node:url";
import { writeBootstrapFiles } from "../src/bootstrap-files.ts";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

const written = writeBootstrapFiles(DIST);
console.log(`variations: wrote ${written.join(", ")} to ${DIST}`);
