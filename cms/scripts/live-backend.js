// Generates the strapi-php backend from this directory with a local camis checkout, boots it on
// 127.0.0.1 for a test run, runs a command against it and tears it down. camis is found through
// CAMIS_DIR, as in camis.js. Everything it writes lives in cms/generated/live (git-ignored;
// IDENTITY_LIVE_DIR moves it, for this script's own tests).
//
//   node cms/scripts/live-backend.js -- <command> [args…]   run the command, then stop the servers
//   node cms/scripts/live-backend.js                        serve until interrupted (Ctrl-C)
//
// The command gets IDENTITY_LIVE_BACKEND, the path of a JSON file describing the servers. Before
// booting them it runs the app's PHPUnit tests of the protected ingestion and summary code
// (tests/Feature/Ingest, tests/Feature/Summary),
// with the vector files they share with the TypeScript tests. Each server logs its requests to
// <live dir>/<name>.server.log. A server that exits stops the run at
// once; SIGINT, SIGTERM and SIGHUP are passed on to the command (or to camis or artisan while
// they set up), and the script exits with 128 and the signal's number. After scaffolding it strips
// the VCS checkouts Composer may leave in vendor.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:os";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CMS_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPOSITORY_DIR = fileURLToPath(new URL("../..", import.meta.url));
const LIVE_DIR = resolve(process.env.IDENTITY_LIVE_DIR || join(CMS_DIR, "generated", "live"));
const APP_DIR = join(LIVE_DIR, "strapi-php");
const HOST = "127.0.0.1";
// The page the SDK runs on in the test: same site as the API (the host), another origin (port).
const SITE_ORIGIN = "http://127.0.0.1:5173";
const MAIL_LOG = join(APP_DIR, "storage", "logs", "laravel.log");
const BOOT_TIMEOUT_MS = 30_000;
const MINIMUM_PHP_VERSION_ID = 80300;
// What PHP and Composer need from this shell. Nothing else passes to them: a variable exported
// in the shell (MAIL_MAILER, DB_CONNECTION, APP_ENV, CAMIS_…) would otherwise win over the .env
// written below, since Laravel's dotenv never overrides a variable already set.
const INHERITED = [
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "SYSTEMROOT",
  "COMPOSER_HOME",
  "COMPOSER_CACHE_DIR",
  "COMPOSER_ALLOW_SUPERUSER",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "CURL_CA_BUNDLE",
];

// Rates high enough that the suite never meets them, except on the server kept for throttling.
const RELAXED_RATE = 1000;
const THROTTLED_RATE = 3;
// The ingestion endpoint's rates on the server kept for them: per address (camis' guard) and per key.
const INGEST_LIMITED_ADDRESS_RATE = 6;
const INGEST_LIMITED_KEY_RATE = 3;
// camis' default, and on the short-lived server a lifespan short enough to outlive in a test.
const ACCESS_TOKEN_LIFESPAN = 600;
const SHORT_ACCESS_TOKEN_LIFESPAN = 2;

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
  CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE: "true",
  CAMIS_ACCOUNT_MAIL_PER_HOUR: "3",
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
  // Strapi's answers, which tell accounts apart: the SDK must stay safe against them too.
  {
    name: "disclosing",
    emailConfirmation: true,
    rate: RELAXED_RATE,
    hideAccountExistence: false,
  },
  { name: "throttled", emailConfirmation: false, rate: THROTTLED_RATE },
  {
    name: "shortLived",
    emailConfirmation: false,
    rate: RELAXED_RATE,
    accessTokenLifespan: SHORT_ACCESS_TOKEN_LIFESPAN,
  },
  {
    name: "ingestLimited",
    emailConfirmation: false,
    rate: RELAXED_RATE,
    ingestRate: INGEST_LIMITED_ADDRESS_RATE,
    ingestKeyRate: INGEST_LIMITED_KEY_RATE,
  },
];

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const step = (message) => {
  process.stdout.write(`live-backend: ${message}\n`);
};

const onPath = (command) => spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;

/** The environment PHP runs in: the inherited allowlist, then this script's settings. */
const phpEnvironment = (settings) => ({
  ...Object.fromEntries(
    INHERITED.flatMap((name) =>
      process.env[name] === undefined ? [] : [[name, process.env[name]]],
    ),
  ),
  ...settings,
});

let signalled = false;

/** The setup step running now (camis, artisan), so a signal can stop it and what it started. */
let current;

/**
 * Runs a setup step in a process group of its own and waits for it. A signal stops the whole group:
 * camis.js runs the CLI as a child of its own, which a signal to camis.js alone would leave running.
 */
const run = (command, args, options = {}) =>
  new Promise((done) => {
    const child = spawn(command, args, { stdio: "inherit", ...options, detached: true });
    current = child;
    child.on("error", (error) => {
      fail(`could not run ${command}: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      current = undefined;
      if (signalled) return; // onSignal exits once the step has
      if (code !== 0) {
        const how = signal === null ? `exit ${String(code)}` : signal;
        fail(`${command} ${args.join(" ")} failed (${how})`);
      }
      done();
    });
  });

const camis = (...args) =>
  run(process.execPath, [join(CMS_DIR, "scripts", "camis.js"), ...args], {
    cwd: CMS_DIR,
    // Absolute: camis.js resolves it against its own working directory, cms/ here.
    env: phpEnvironment({ CAMIS_DIR: resolve(process.env.CAMIS_DIR ?? "") }),
  });

/**
 * Removes the VCS checkouts Composer leaves in vendor when it clones a package rather than
 * downloading its archive (as it does where GitHub's archives are out of reach): gigabytes the
 * app never reads.
 */
const stripVendorVcs = () => {
  const vendor = join(APP_DIR, "vendor");
  for (const owner of readdirSync(vendor, { withFileTypes: true })) {
    if (!owner.isDirectory()) continue;
    for (const pkg of readdirSync(join(vendor, owner.name), { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      for (const vcs of [".git", ".hg", ".svn"]) {
        rmSync(join(vendor, owner.name, pkg.name, vcs), { recursive: true, force: true });
      }
    }
  }
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
  const version = spawnSync("php", ["-r", "echo PHP_VERSION_ID, ' ', PHP_VERSION;"], {
    encoding: "utf8",
    env: phpEnvironment({}),
  });
  if (version.error !== undefined || version.status !== 0) {
    fail("php is not on PATH; the strapi-php backend needs PHP 8.3 or newer.");
  }
  const [id = "0", name = "unknown"] = version.stdout.trim().split(" ");
  if (Number(id) < MINIMUM_PHP_VERSION_ID) {
    fail(`PHP ${name} is on PATH; the strapi-php backend needs PHP 8.3 or newer.`);
  }
};

// Written once camis' scaffold has finished and vendor is stripped: camis creates
// vendor/autoload.php in its first step, so that file alone does not mean a finished app.
const SCAFFOLDED = join(LIVE_DIR, "strapi-php.scaffolded");

const scaffolded = () => existsSync(SCAFFOLDED);

// The line camis' scaffold adds to bootstrap/providers.php (generated DEPLOY.md), and the admin
// panel's entry it follows.
const AUTH_PROVIDER_LINE =
  "...(class_exists(\\App\\Providers\\CamisAuthServiceProvider::class) ? [\\App\\Providers\\CamisAuthServiceProvider::class] : []),";
const PANEL_ENTRY = /^([ \t]*)\\?App\\Providers\\Filament\\AdminPanelProvider::class,?[ \t]*\r?$/m;

/**
 * Adds camis' auth provider to an app scaffolded before the scaffold registered it (the admin
 * panel's sign-in; nothing the SDK uses), after the panel's entry, as a fresh scaffold has it, so
 * the build stops warning. Once there, or without the panel's entry, the file is left alone.
 */
const registerAuthProvider = () => {
  const path = join(APP_DIR, "bootstrap", "providers.php");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  if (text.includes("CamisAuthServiceProvider")) return;
  const panel = PANEL_ENTRY.exec(text);
  if (panel === null) return;
  const entry = panel[0].replace(/\r$/, "");
  const eol = panel[0].endsWith("\r") ? "\r\n" : "\n";
  const listed = entry.trimEnd().endsWith(",") ? entry : `${entry.trimEnd()},`;
  const at = panel.index;
  const after = at + panel[0].length + (text.slice(at + panel[0].length).startsWith("\n") ? 1 : 0);
  writeFileSync(
    path,
    `${text.slice(0, at)}${listed}${eol}${panel[1]}${AUTH_PROVIDER_LINE}${eol}${text.slice(after)}`,
  );
};

// The end of the StrapiErrors block in bootstrap/app.php, and the lines camis' scaffold adds after
// it for an endpoint that answers browsers itself (camis' scaffold.ts, ENDPOINT_CORS_SKIP).
const STRAPI_MIDDLEWARE_END =
  "            $middleware->convertEmptyStringsToNull(except: [$strapiRoutes]);\n        }\n";
const ENDPOINT_CORS_SKIP = `        // camis: an endpoint that answers browsers on any origin itself (crossOrigin) is left alone by the app's CORS.
        if (class_exists(\\App\\Http\\Middleware\\StrapiEndpointCors::class)) {
            \\Illuminate\\Http\\Middleware\\HandleCors::skipWhen(\\App\\Http\\Middleware\\StrapiEndpointCors::answers(...));
        }
`;

/**
 * Leaves Laravel's global CORS off the ingestion endpoint, which answers browsers on any origin
 * itself, in an app scaffolded before camis' scaffold did so (camis build warns with these lines).
 * Without them the endpoint's preflight gets the app's CORS answer, which does not allow the SDK's
 * write-key header. Once there, or without camis' middleware block, the file is left alone.
 */
const leaveEndpointCorsToCamis = () => {
  const path = join(APP_DIR, "bootstrap", "app.php");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  if (text.includes("StrapiEndpointCors") || !text.includes(STRAPI_MIDDLEWARE_END)) return;
  writeFileSync(
    path,
    text.replace(STRAPI_MIDDLEWARE_END, () => `${STRAPI_MIDDLEWARE_END}${ENDPOINT_CORS_SKIP}`),
  );
};

/** Scaffolds the Laravel host app once (Composer, network) and regenerates camis' files on it. */
const generate = async () => {
  mkdirSync(LIVE_DIR, { recursive: true });
  if (!scaffolded()) {
    if (!onPath("composer")) {
      fail("composer is not on PATH; the first run scaffolds the Laravel app with Composer.");
    }
    step("scaffolding the Laravel app (once; needs Composer and Packagist)");
    // A partial app from an interrupted scaffold goes; rmSync removes a symlink, not its target.
    rmSync(APP_DIR, { recursive: true, force: true });
    await camis("scaffold", "filament", APP_DIR);
    stripVendorVcs();
    writeFileSync(SCAFFOLDED, "");
  }
  registerAuthProvider();
  leaveEndpointCorsToCamis();
  const fromLive = (file) => relative(LIVE_DIR, join(CMS_DIR, file));
  const config = {
    ir: fromLive("camis.json"),
    roles: fromLive("roles.json"),
    protected: fromLive("protected"),
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
  await camis("build", "--config", join(LIVE_DIR, "camis.config.json"));
};

/** The rates a server runs with: camis' defaults for the ceiling and refresh unless relaxed. */
const ratesOf = (server) => ({
  throttlePerMinute: server.rate,
  addressThrottlePerMinute: Math.max(server.rate, 50),
  refreshThrottlePerMinute: server.rate,
  ingestThrottlePerMinute: server.ingestRate ?? RELAXED_RATE,
  ingestKeyRatePerMinute: server.ingestKeyRate ?? RELAXED_RATE,
});

const serverEnvironment = (server, port) => {
  const rates = ratesOf(server);
  return {
    CAMIS_ACCESS_TOKEN_LIFESPAN: String(server.accessTokenLifespan ?? ACCESS_TOKEN_LIFESPAN),
    DB_DATABASE: join(LIVE_DIR, `${server.name}.sqlite`),
    APP_URL: `http://${HOST}:${String(port)}`,
    CAMIS_EMAIL_CONFIRMATION: String(server.emailConfirmation),
    CAMIS_AUTH_HIDE_ACCOUNT_EXISTENCE: String(server.hideAccountExistence ?? true),
    CAMIS_AUTH_THROTTLE_PER_MINUTE: String(rates.throttlePerMinute),
    CAMIS_AUTH_ADDRESS_THROTTLE_PER_MINUTE: String(rates.addressThrottlePerMinute),
    CAMIS_REFRESH_THROTTLE_PER_MINUTE: String(rates.refreshThrottlePerMinute),
    CAMIS_ENDPOINT_INGEST_EVENT_THROTTLE_PER_MINUTE: String(rates.ingestThrottlePerMinute),
    INGEST_KEY_RATE_PER_MINUTE: String(rates.ingestKeyRatePerMinute),
  };
};

/** A fresh database for the server, migrated and seeded with the roles. */
const prepareDatabase = async (env) => {
  rmSync(env.DB_DATABASE, { force: true });
  writeFileSync(env.DB_DATABASE, "");
  const options = { cwd: APP_DIR, env, stdio: ["ignore", "ignore", "inherit"] };
  await run("php", ["artisan", "migrate", "--force", "--no-interaction"], options);
  await run(
    "php",
    ["artisan", "db:seed", "--class=RolePermissionSeeder", "--force", "--no-interaction"],
    options,
  );
};

/**
 * The app's PHPUnit tests of the protected ingestion and summary code, reading the vector files the
 * TypeScript tests read, so both targets' handlers answer alike. phpunit.xml sets the testing environment (an
 * in-memory sqlite, the array cache); the rest comes from the .env written above.
 */
const runPhpTests = async () => {
  step("running the ingestion and summary handlers' PHPUnit tests");
  const suites = ["tests/Feature/Ingest", "tests/Feature/Summary"];
  await run("php", ["vendor/bin/phpunit", "--colors=never", ...suites], {
    cwd: APP_DIR,
    env: phpEnvironment({
      TRACKING_BATCH_VECTORS: join(
        REPOSITORY_DIR,
        "packages",
        "tracking",
        "src",
        "testing",
        "batch-vectors.json",
      ),
      INGEST_NORMALISE_VECTORS: join(CMS_DIR, "tests", "fixtures", "ingest-normalise-vectors.json"),
      PROPERTY_SUMMARY_VECTORS: join(CMS_DIR, "tests", "fixtures", "property-summary-vectors.json"),
    }),
  });
};

const waitUntilUp = async (url, exited) => {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline && !exited()) {
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
let stopping = false;

const stopServers = () => {
  stopping = true;
  for (const child of children.splice(0)) child.kill("SIGTERM");
};

/** The end of a server's log, for the message when it stops. */
const tail = (path) => {
  try {
    return readFileSync(path, "utf8").trimEnd().split("\n").slice(-20).join("\n");
  } catch {
    return "(no log)";
  }
};

let runner;

/** A server stopped by itself: stop everything, the command too, and say why. */
const serverExited = (name, code, signal, log) => {
  if (stopping) return;
  runner?.kill("SIGTERM");
  stopServers();
  const how = signal === null ? `with code ${String(code)}` : `on ${signal}`;
  fail(`live-backend: the ${name} server exited ${how}; its log, ${log}, ends:\n${tail(log)}`);
};

const startServer = async (server, shared) => {
  const port = await freePort();
  const env = phpEnvironment({ ...shared, ...serverEnvironment(server, port) });
  await prepareDatabase(env);
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
  // The server logs every request to stderr: a file, never a pipe this process would have to drain.
  const logPath = join(LIVE_DIR, `${server.name}.server.log`);
  const log = openSync(logPath, "w");
  const child = spawn("php", ["-S", `${HOST}:${String(port)}`, router], {
    cwd: join(APP_DIR, "public"),
    env,
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  children.push(child);
  let exited = false;
  child.on("exit", (code, signal) => {
    exited = true;
    serverExited(server.name, code, signal, logPath);
  });
  await waitUntilUp(env.APP_URL, () => exited);
  step(`${server.name} server on ${env.APP_URL}`);
  return {
    name: server.name,
    url: env.APP_URL,
    emailConfirmation: server.emailConfirmation,
    hideAccountExistence: server.hideAccountExistence ?? true,
    accessTokenLifetimeSeconds: server.accessTokenLifespan ?? ACCESS_TOKEN_LIFESPAN,
    ...ratesOf(server),
    database: env.DB_DATABASE,
  };
};

/**
 * Passes a signal on to the command, or to the setup step's process group, and exits with 128 and
 * the signal's number once it has stopped; at once when neither is running.
 */
const onSignal = (signal) => {
  signalled = true;
  const status = 128 + constants.signals[signal];
  const stopped = () => {
    stopServers();
    process.exit(status);
  };
  if (current !== undefined && current.exitCode === null) {
    current.once("exit", stopped);
    try {
      process.kill(-current.pid, signal);
    } catch {
      current.kill(signal);
    }
    return;
  }
  if (runner === undefined || runner.exitCode !== null) {
    stopped();
    return;
  }
  runner.kill(signal);
  runner.once("exit", stopped);
};

const main = async () => {
  process.on("exit", stopServers);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, onSignal);
  checkPrerequisites();
  await generate();
  const shared = sharedEnvironment();
  writeFileSync(join(APP_DIR, ".env"), dotenv(shared));
  await runPhpTests();
  rmSync(MAIL_LOG, { force: true });
  const servers = [];
  for (const server of SERVERS) servers.push(await startServer(server, shared));
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
  runner = spawn(executable, args, {
    stdio: "inherit",
    env: { ...process.env, IDENTITY_LIVE_BACKEND: description },
    shell: process.platform === "win32",
  });
  runner.on("error", (error) => {
    stopServers();
    fail(`could not run ${executable}: ${error.message}`);
  });
  runner.on("exit", (code, signal) => {
    if (signalled) return; // onSignal exits once the command has
    stopServers();
    process.exit(signal === null ? (code ?? 1) : 128 + constants.signals[signal]);
  });
};

main().catch((error) => {
  stopServers();
  fail(`live-backend: ${error instanceof Error ? error.message : String(error)}`);
});
