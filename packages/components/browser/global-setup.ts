import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BROWSER_PORT } from "./port";
import { startStaticServer } from "./static-server";

const WWW = fileURLToPath(new URL("../www", import.meta.url));

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(WWW)) {
    throw new Error("packages/components/www is missing. Run the components build first.");
  }
  const server = await startStaticServer(WWW, BROWSER_PORT);
  return () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
}
