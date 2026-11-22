// Generates the strapi-php backend from this directory with a local camis checkout, boots it on
// 127.0.0.1 for a test run, runs a command against it and tears it down. camis is found through
// CAMIS_DIR, as in camis.js. Everything it writes lives in cms/generated/live (git-ignored).
//
//   node cms/scripts/live-backend.js -- <command> [args…]   run the command, then stop the servers
//   node cms/scripts/live-backend.js                        serve until interrupted (Ctrl-C)
//
// The command gets IDENTITY_LIVE_BACKEND, the path of a JSON file describing the servers.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CMS_DIR = fileURLToPath(new URL("..", import.meta.url));
const LIVE_DIR = join(CMS_DIR, "generated", "live");
const APP_DIR = join(LIVE_DIR, "strapi-php");
const HOST = "127.0.0.1";
// The page the SDK runs on in the test: same site as the API (the host), another origin (port).
const SITE_ORIGIN = "http://127.0.0.1:5173";
const MAIL_LOG = join(APP_DIR, "storage", "logs", "laravel.log");
const BOOT_TIMEOUT_MS = 30_000;

// Rates high enough that the suite never meets them, except on the server kept for throttling.
const RELAXED_RATE = 1000;
const THROTTLED_RATE = 3;

/**
 * The deployment settings of cms/.env.example that the SDK needs, as the test run sets them. Only
 * the database, the URLs and the rates differ between the servers.
 */
const sharedEnvironment = () => ({
  APP_NAME: "identgineer-cms",
  APP_ENV: "production",
  APP_DEBUG: "false",
  APP_KEY: `base64:${randomBytes(32).toString("base64")}`,
  DB_CONNECTION: "sqlite",
  CACHE_STORE: "database",
  SESSION_DRIVER: "database",
  QUEUE_CONNECTION: "sync",
  LOG_CHANNEL: "single",
  LOG_LEVEL: "debug",
  MAIL_MAILER: "log",
  MAIL_FROM_ADDRESS: "cms@example.test",
  API_TOKEN_SALT: randomBytes(16).toString("hex"),
  ADMIN_JWT_SECRET: randomBytes(32).toString("hex"),
  TRANSFER_TOKEN_SALT: randomBytes(16).toString("hex"),
  CAMIS_JWT_MANAGEMENT: "refresh",
  CAMIS_ACCESS_TOKEN_LIFESPAN: "600",
  CAMIS_SESSIONS_COOKIE_SECURE: "true",
  CAMIS_SESSIONS_COOKIE_SAME_SITE: "strict",
  CAMIS_SESSIONS_COOKIE_PATH: "/api/auth",
  CAMIS_CORS_ORIGIN: SITE_ORIGIN,
  CAMIS_CORS_HEADERS:
    "Content-Type,Authorization,Origin,Accept,X-Requested-With,x-strapi-refresh-cookie",
  CAMIS_CORS_EXPOSE: "Retry-After",
  CAMIS_EMAIL_RESET_PASSWORD_URL: `${SITE_ORIGIN}/reset-password`,
  CAMIS_EMAIL_CONFIRMATION_REDIRECTION: `${SITE_ORIGIN}/confirmed`,
});

/** The servers: their name in the description file and what sets them apart. */
const SERVERS = [
  { name: "main", emailConfirmation: false, rate: RELAXED_RATE },
  { name: "confirmation", emailConfirmation: true, rate: RELAXED_RATE },
  { name: "throttled", emailConfirmation: false, rate: THROTTLED_RATE },
];

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const step = (message) => {
  process.stdout.write(`live-backend: ${message}\n`);
};

const onPath = (command) => spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error !== undefined) fail(`could not run ${command}: ${result.error.message}`);
  if (result.status !== 0)
    fail(`${command} ${args.join(" ")} failed (exit ${String(result.status)})`);
};

const camis = (...args) => {
  run(process.execPath, [join(CMS_DIR, "scripts", "camis.js"), ...args], { cwd: CMS_DIR });
};

const freePort = () =>
  new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => {
        resolvePort(typeof address === "object" && address !== null ? address.port : 0);
      });
    });
  });

const dotenv = (values) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";

const checkPrerequisites = () => {
  const camisDir = process.env.CAMIS_DIR;
  if (camisDir === undefined || camisDir === "") {
    fail("CAMIS_DIR is not set. Point it at a camis checkout, as for pnpm cms:validate.");
  }
  if (!existsSync(resolve(camisDir, "packages", "cli", "bin", "camis.mjs"))) {
    fail(`CAMIS_DIR does not hold a camis checkout: ${camisDir}`);
  }
  for (const command of ["php", "composer"]) {
    if (!onPath(command))
      fail(`${command} is not on PATH; the strapi-php backend needs PHP 8.3 and Composer.`);
  }
};

/** Scaffolds the Laravel host app once (Composer, network) and regenerates camis' files on it. */
const generate = () => {
  mkdirSync(LIVE_DIR, { recursive: true });
  if (!existsSync(join(APP_DIR, "vendor", "autoload.php"))) {
    step("scaffolding the Laravel app (once; needs Composer and Packagist)");
    rmSync(APP_DIR, { recursive: true, force: true });
    camis("scaffold", "filament", "generated/live/strapi-php");
  }
  const config = {
    ir: "../../camis.json",
    roles: "../../roles.json",
    protected: "../../protected",
    targets: [
      {
        target: "filament",
        out: "./strapi-php",
        projectName: "identgineer-cms",
        apiStyle: "strapi",
      },
    ],
  };
  writeFileSync(join(LIVE_DIR, "camis.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  step("generating the backend from cms/camis.json");
  camis("build", "--config", "generated/live/camis.config.json");
};

/** The rates a server runs with: camis' defaults for the ceiling and refresh unless relaxed. */
const ratesOf = (server) => ({
  throttlePerMinute: server.rate,
  addressThrottlePerMinute: Math.max(server.rate, 50),
  refreshThrottlePerMinute: server.rate === RELAXED_RATE ? RELAXED_RATE : 60,
});

const serverEnvironment = (server, port) => {
  const rates = ratesOf(server);
  return {
    DB_DATABASE: join(LIVE_DIR, `${server.name}.sqlite`),
    APP_URL: `http://${HOST}:${String(port)}`,
    CAMIS_EMAIL_CONFIRMATION: String(server.emailConfirmation),
    CAMIS_AUTH_THROTTLE_PER_MINUTE: String(rates.throttlePerMinute),
    CAMIS_AUTH_ADDRESS_THROTTLE_PER_MINUTE: String(rates.addressThrottlePerMinute),
    CAMIS_REFRESH_THROTTLE_PER_MINUTE: String(rates.refreshThrottlePerMinute),
  };
};

/** A fresh database for the server, migrated and seeded with the roles. */
const prepareDatabase = (env) => {
  rmSync(env.DB_DATABASE, { force: true });
  writeFileSync(env.DB_DATABASE, "");
  const options = {
    cwd: APP_DIR,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "inherit"],
  };
  run("php", ["artisan", "migrate", "--force", "--no-interaction"], options);
  run(
    "php",
    ["artisan", "db:seed", "--class=RolePermissionSeeder", "--force", "--no-interaction"],
    options,
  );
};

const waitUntilUp = async (url) => {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/up`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((wake) => setTimeout(wake, 250));
  }
  throw new Error(`${url} did not come up within ${String(BOOT_TIMEOUT_MS / 1000)} s`);
};

const children = [];

const stopServers = () => {
  for (const child of children.splice(0)) child.kill("SIGTERM");
};

const startServer = async (server) => {
  const port = await freePort();
  const env = serverEnvironment(server, port);
  prepareDatabase(env);
  // PHP's built-in server with Laravel's router script, as `php artisan serve` runs it, but with
  // this process's environment passed through so each server gets its own settings.
  const router = join(
    APP_DIR,
    "vendor",
    "laravel",
    "framework",
    "src",
    "Illuminate",
    "Foundation",
    "resources",
    "server.php",
  );
  const child = spawn("php", ["-S", `${HOST}:${String(port)}`, router], {
    cwd: join(APP_DIR, "public"),
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.resume();
  children.push(child);
  await waitUntilUp(env.APP_URL);
  step(`${server.name} server on ${env.APP_URL}`);
  return {
    name: server.name,
    url: env.APP_URL,
    emailConfirmation: server.emailConfirmation,
    ...ratesOf(server),
  };
};

const main = async () => {
  checkPrerequisites();
  generate();
  writeFileSync(join(APP_DIR, ".env"), dotenv(sharedEnvironment()));
  rmSync(MAIL_LOG, { force: true });
  process.on("exit", stopServers);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopServers();
      process.exit(130);
    });
  }
  const servers = [];
  for (const server of SERVERS) servers.push(await startServer(server));
  const description = join(LIVE_DIR, "backend.json");
  const backend = {
    siteOrigin: SITE_ORIGIN,
    mailLog: MAIL_LOG,
    servers: Object.fromEntries(servers.map((server) => [server.name, server])),
  };
  writeFileSync(description, `${JSON.stringify(backend, null, 2)}\n`);

  const separator = process.argv.indexOf("--");
  const command = separator === -1 ? [] : process.argv.slice(separator + 1);
  if (command.length === 0) {
    step(`serving; IDENTITY_LIVE_BACKEND=${description}; Ctrl-C stops`);
    return;
  }
  const [executable = "", ...args] = command;
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    env: { ...process.env, IDENTITY_LIVE_BACKEND: description },
    shell: process.platform === "win32",
  });
  stopServers();
  process.exit(result.status ?? 1);
};

main().catch((error) => {
  stopServers();
  fail(`live-backend: ${error instanceof Error ? error.message : String(error)}`);
});
