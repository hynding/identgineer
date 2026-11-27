import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.ts";

// Serves the built site locally with the headers it was built for. Run `pnpm build` again to see a
// change: the pages are prerendered, so there is nothing to reload on the fly.
const WWW = fileURLToPath(new URL("../www", import.meta.url));
const PORT = Number(process.env.IDG_SITE_PORT ?? 4174);

await startStaticServer(WWW, PORT);
console.log(`The site is served at http://127.0.0.1:${String(PORT)}/`);
