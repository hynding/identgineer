import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// fileURLToPath, not URL.pathname: pathname keeps percent-encoding, so a checkout path with a space would not resolve.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKSPACE_PARENTS = ["packages", "apps"];

interface WorkspacePackage {
  directory: string;
  manifest: { name?: string; private?: boolean };
}

function listWorkspacePackages(): WorkspacePackage[] {
  return WORKSPACE_PARENTS.flatMap((parent) =>
    readdirSync(join(ROOT, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
      .map((entry) => ({
        directory: entry.name,
        manifest: JSON.parse(
          readFileSync(join(ROOT, parent, entry.name, "package.json"), "utf8"),
        ) as WorkspacePackage["manifest"],
      })),
  );
}

describe("workspace conventions", () => {
  const workspacePackages = listWorkspacePackages();

  it("finds the workspace packages", () => {
    expect(workspacePackages.length).toBeGreaterThan(0);
  });

  it.each(workspacePackages)(
    "$directory is named @identgineer/<directory>",
    ({ directory, manifest }) => {
      expect(manifest.name).toBe(`@identgineer/${directory}`);
    },
  );

  it.each(workspacePackages)("$directory is private", ({ manifest }) => {
    expect(manifest.private).toBe(true);
  });
});
