import { describe, expect, it } from "vitest";
import { allows } from "./authorize";
import { loadIr, loadRoles, OWNER_CONDITION, roleNamed, type Action } from "./model";

const ir = loadIr();
const roles = loadRoles();
const publicRole = roleNamed(roles, "public");
const authenticated = roleNamed(roles, "authenticated");
const superAdmin = roleNamed(roles, "super-admin");

const ACTIONS: Action[] = ["create", "read", "update", "delete", "publish"];
const WRITES: Action[] = ["create", "update", "delete", "publish"];
/** Site content anyone may read. */
const SITE_CONTENT = ["Page", "NavigationItem"];
/** Types holding one user's data: each row belongs to its `owner`. */
const OWNED = ["Profile", "BrandKit", "Property", "Event", "ConsentRecord"];
/** Types written only by the public ingestion endpoints, never through a grant. */
const INGESTED = ["Event", "ConsentRecord"];
const PRIVATE = ["User", "File", ...OWNED];

const ME = 7;
const SOMEONE_ELSE = 8;
const mine = { "user.id": ME, "record.ownerId": ME };
const theirs = { "user.id": ME, "record.ownerId": SOMEONE_ELSE };

describe("roles.json", () => {
  it("declares exactly the public, authenticated and super-admin roles", () => {
    expect(roles.roles.map((r) => r.name).sort()).toEqual([
      "authenticated",
      "public",
      "super-admin",
    ]);
  });

  it("registers new users as authenticated", () => {
    expect(roles.defaultRole).toBe("authenticated");
  });

  it("names only content types the IR declares", () => {
    const declared = new Set(ir.contentTypes.map((ct) => ct.name));
    const named = roles.roles.flatMap((r) => r.grants.map((g) => g.contentType));
    expect(named.filter((name) => !declared.has(name))).toEqual([]);
  });

  it("grants every content type the IR declares to some role", () => {
    const granted = new Set(roles.roles.flatMap((r) => r.grants.map((g) => g.contentType)));
    expect(ir.contentTypes.map((ct) => ct.name).filter((name) => !granted.has(name))).toEqual([]);
  });

  it("uses no field rules, which the strapi-php target does not enforce", () => {
    expect(roles.roles.flatMap((r) => r.grants).filter((g) => g.fieldRules !== undefined)).toEqual(
      [],
    );
  });
});

describe("the public role", () => {
  it("is not an admin role", () => {
    expect(publicRole.admin).toBeUndefined();
  });

  it.each(PRIVATE)("cannot read or list %s", (contentType) => {
    expect(allows(publicRole, contentType, "read")).toBe(false);
    expect(allows(publicRole, contentType, "read", { "record.ownerId": null })).toBe(false);
  });

  it.each(ir.contentTypes.map((ct) => ct.name))("cannot write %s", (contentType) => {
    for (const action of WRITES) expect(allows(publicRole, contentType, action)).toBe(false);
  });

  it("is granted nothing beyond reading site content", () => {
    expect(
      publicRole.grants.filter(
        (g) => !SITE_CONTENT.includes(g.contentType) || g.actions.some((a) => a !== "read"),
      ),
    ).toEqual([]);
  });

  it.each(SITE_CONTENT)("reads %s", (contentType) => {
    expect(allows(publicRole, contentType, "read")).toBe(true);
  });

  // Both targets can enforce a conditioned public read now, but the model adds none until the
  // brand identity feature decides which brand kits are public (issue #18).
  it("holds no conditioned grant", () => {
    expect(publicRole.grants.filter((g) => g.condition !== undefined)).toEqual([]);
  });

  it("lists no endpoints or services", () => {
    expect(publicRole.endpoints ?? []).toEqual([]);
    expect(publicRole.services ?? []).toEqual([]);
  });
});

describe("the authenticated role", () => {
  it("is not an admin role", () => {
    expect(authenticated.admin).toBeUndefined();
  });

  it("cannot read, list or change user accounts", () => {
    for (const action of ACTIONS) expect(allows(authenticated, "User", action, mine)).toBe(false);
  });

  it.each(OWNED)("holds every %s grant under the ownership condition", (contentType) => {
    const grants = authenticated.grants.filter((g) => g.contentType === contentType);
    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) expect(grant.condition).toEqual(OWNER_CONDITION);
  });

  it.each(OWNED)("fills the owner of a %s it creates from the session", (contentType) => {
    for (const grant of authenticated.grants.filter(
      (g) => g.contentType === contentType && g.actions.includes("create"),
    )) {
      expect(grant.assign).toEqual({ owner: "user.id" });
    }
  });

  it.each(OWNED)("cannot touch someone else's %s", (contentType) => {
    for (const action of ACTIONS) {
      expect(allows(authenticated, contentType, action, theirs)).toBe(false);
    }
  });

  it.each(OWNED)("cannot touch a %s whose owner is unknown", (contentType) => {
    for (const action of ACTIONS) {
      expect(allows(authenticated, contentType, action, { "user.id": ME })).toBe(false);
      expect(allows(authenticated, contentType, action, { "record.ownerId": ME })).toBe(false);
    }
  });

  it.each(OWNED)("reads its own %s", (contentType) => {
    expect(allows(authenticated, contentType, "read", mine)).toBe(true);
  });

  it.each(["BrandKit", "Property"])("creates, updates and deletes its own %s", (contentType) => {
    for (const action of ["create", "update", "delete"] as const) {
      expect(allows(authenticated, contentType, action, mine)).toBe(true);
    }
  });

  it("creates and updates its own profile, but cannot delete it", () => {
    expect(allows(authenticated, "Profile", "create", mine)).toBe(true);
    expect(allows(authenticated, "Profile", "update", mine)).toBe(true);
    expect(allows(authenticated, "Profile", "delete", mine)).toBe(false);
  });

  it.each(INGESTED)("cannot write %s, even its own", (contentType) => {
    for (const action of WRITES)
      expect(allows(authenticated, contentType, action, mine)).toBe(false);
  });

  it("may upload files but not list, change or delete them", () => {
    expect(allows(authenticated, "File", "create")).toBe(true);
    for (const action of ["read", "update", "delete"] as const) {
      expect(allows(authenticated, "File", action)).toBe(false);
    }
  });

  it.each(SITE_CONTENT)("reads %s but cannot change it", (contentType) => {
    expect(allows(authenticated, contentType, "read")).toBe(true);
    for (const action of WRITES) expect(allows(authenticated, contentType, action)).toBe(false);
  });

  it("lists no endpoints or services", () => {
    expect(authenticated.endpoints ?? []).toEqual([]);
    expect(authenticated.services ?? []).toEqual([]);
  });
});

describe("the super-admin role", () => {
  it("signs in to the admin", () => {
    expect(superAdmin.admin).toBe(true);
  });

  it("is the only admin role", () => {
    expect(roles.roles.filter((r) => r.admin === true).map((r) => r.name)).toEqual(["super-admin"]);
  });

  it.each(ir.contentTypes.map((ct) => ct.name))("may do everything to %s", (contentType) => {
    const draftPublish = ir.contentTypes.find((ct) => ct.name === contentType)?.options
      ?.draftPublish;
    const expected = ACTIONS.filter((a) => a !== "publish" || draftPublish === true);
    for (const action of expected) {
      expect(allows(superAdmin, contentType, action, theirs)).toBe(true);
    }
  });
});
