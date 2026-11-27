import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../scripts/static-server.ts";
import { SITE_PORT } from "./port";

const WWW = fileURLToPath(new URL("../www", import.meta.url));

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(WWW)) {
    throw new Error("apps/site/www is missing. Run the site's build first.");
  }
  const server = await startStaticServer(WWW, SITE_PORT);
  return () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
}
