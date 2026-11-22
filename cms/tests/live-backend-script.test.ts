import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fake, NODE, removeFakes, runFake, SCRIPT } from "./fake-php";

const run = (camisDir: string | undefined) => {
  const env: NodeJS.ProcessEnv = { ...process.env, CAMIS_DIR: camisDir };
  if (camisDir === undefined) delete env.CAMIS_DIR;
  return spawnSync(NODE, [SCRIPT, "--", "true"], { encoding: "utf8", env });
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const stat = existsSync(`/proc/${String(pid)}/stat`)
    ? readFileSync(`/proc/${String(pid)}/stat`, "utf8")
    : "";
  return !/^\d+ \(.*\) Z/.test(stat);
};

describe("cms/scripts/live-backend.js", () => {
  const empty = mkdtempSync(join(tmpdir(), "camis-dir-"));
  afterAll(() => {
    rmSync(empty, { recursive: true, force: true });
    removeFakes();
  });

  it("refuses to run without CAMIS_DIR, before writing anything", () => {
    const result = run(undefined);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAMIS_DIR is not set");
    expect(result.stdout).toBe("");
  });

  it("refuses a CAMIS_DIR that is not a camis checkout", () => {
    const result = run(empty);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`CAMIS_DIR does not hold a camis checkout: ${empty}`);
  });

  it("refuses a PHP older than 8.3, naming the one it found", () => {
    const result = runFake(fake({ version: "80210 8.2.10" }), [NODE, "-e", ""]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PHP 8.2.10 is on PATH; the strapi-php backend needs PHP 8.3");
  });

  it(
    "boots a scaffolded app without Composer on 127.0.0.1 only, and hands the command the description",
    { timeout: 30_000 },
    () => {
      const setup = fake();
      const check = `const b = require(process.env.IDENTITY_LIVE_BACKEND); process.exit(Object.keys(b.servers).length === 4 ? 0 : 3);`;
      const result = runFake(setup, [NODE, "-e", check]);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const servers = setup.records("server.jsonl");
      expect(servers).toHaveLength(4);
      for (const server of servers) expect(server.args[1]).toMatch(/^127\.0\.0\.1:\d+$/);
    },
  );

  it("makes a fresh APP_KEY on every run", { timeout: 30_000 }, () => {
    const setup = fake();
    const key = () =>
      /^APP_KEY=base64:(\S{44})$/m.exec(
        readFileSync(join(setup.live, "strapi-php", ".env"), "utf8"),
      )?.[1];
    runFake(setup, [NODE, "-e", ""]);
    const first = key();
    runFake(setup, [NODE, "-e", ""]);
    expect(first).toBeDefined();
    expect(key()).toBeDefined();
    expect(key()).not.toBe(first);
  });

  it("gives PHP the settings it writes, never what the shell exported", { timeout: 30_000 }, () => {
    const setup = fake();
    const result = runFake(setup, [NODE, "-e", ""], {
      MAIL_MAILER: "smtp",
      DB_CONNECTION: "mysql",
      APP_ENV: "local",
      CAMIS_CORS_ORIGIN: "*",
      CAMIS_EMAIL_CONFIRMATION: "true",
      SOME_TOKEN: "from-the-shell",
    });
    expect(result.status).toBe(0);
    const environments = [...setup.records("artisan.jsonl"), ...setup.records("server.jsonl")];
    expect(environments.length).toBeGreaterThan(4);
    for (const { env } of environments) {
      expect(env).toMatchObject({
        MAIL_MAILER: "log",
        DB_CONNECTION: "sqlite",
        APP_ENV: "production",
        CAMIS_CORS_ORIGIN: "http://127.0.0.1:5173",
      });
      expect(env.SOME_TOKEN).toBeUndefined();
    }
    const written = readFileSync(join(setup.live, "strapi-php", ".env"), "utf8");
    expect(written).toContain("MAIL_MAILER=log\n");
  });

  it("stops at once when a server fails to boot, with its log", { timeout: 30_000 }, () => {
    const setup = fake({ serverMode: "die-at-boot" });
    const started = Date.now();
    const result = runFake(setup, [NODE, "-e", ""]);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `the main server exited with code 1; its log, ${join(setup.live, "main.server.log")}`,
    );
    expect(result.stderr).toContain("Failed to listen on 127.0.0.1:");
  });

  it("stops the command and fails when a server dies during the run", { timeout: 30_000 }, () => {
    const setup = fake({ serverMode: "die-after-up" });
    const started = Date.now();
    const result = runFake(setup, [NODE, "-e", "setTimeout(() => {}, 25000)"]);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/the \w+ server exited with code 3/);
  });

  it(
    "passes SIGTERM on to the command, waits for it, and exits 143 with the servers stopped",
    { timeout: 30_000 },
    async () => {
      const setup = fake();
      const marks = join(setup.root, "marks");
      const command = [
        "const fs = require('node:fs');",
        `process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(marks)} + '.term', ''); setTimeout(() => process.exit(0), 300); });`,
        `fs.writeFileSync(${JSON.stringify(marks)} + '.ready', '');`,
        "setTimeout(() => {}, 25000);",
      ].join(" ");
      const child = spawn(NODE, [SCRIPT, "--", NODE, "-e", command], {
        env: setup.env,
        stdio: "ignore",
      });
      const exit = new Promise<number | null>((resolve) =>
        child.on("exit", (code) => {
          resolve(code);
        }),
      );
      while (!existsSync(`${marks}.ready`) && child.exitCode === null) {
        await new Promise((wake) => setTimeout(wake, 50));
      }
      child.kill("SIGTERM");
      expect(await exit).toBe(143);
      expect(existsSync(`${marks}.term`)).toBe(true);
      await new Promise((wake) => setTimeout(wake, 200));
      for (const server of setup.records("server.jsonl")) expect(alive(server.pid)).toBe(false);
    },
  );
});
