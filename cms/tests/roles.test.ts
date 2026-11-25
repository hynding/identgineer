import { describe, expect, it } from "vitest";
import { allows } from "./authorize";
import {
  loadIr,
  loadRoles,
  OWNER_CONDITION,
  PUBLIC_KIT_CONDITION,
  roleNamed,
  type Action,
} from "./model";

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
// Brand kits are read under two grants, so every check of one says whether it is public.
const myPrivateKit = { ...mine, "record.isPublic": false };
const myPublicKit = { ...mine, "record.isPublic": true };
const theirPrivateKit = { ...theirs, "record.isPublic": false };
const theirPublicKit = { ...theirs, "record.isPublic": true };
const publicKitForGuest = { "record.ownerId": SOMEONE_ELSE, "record.isPublic": true };
const privateKitForGuest = { "record.ownerId": SOMEONE_ELSE, "record.isPublic": false };

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

  it.each(PRIVATE)("cannot read or list a private %s", (contentType) => {
    expect(allows(publicRole, contentType, "read")).toBe(false);
    expect(allows(publicRole, contentType, "read", { "record.ownerId": null })).toBe(false);
    expect(allows(publicRole, contentType, "read", privateKitForGuest)).toBe(false);
  });

  it.each(ir.contentTypes.map((ct) => ct.name))("cannot write %s", (contentType) => {
    for (const action of WRITES) expect(allows(publicRole, contentType, action)).toBe(false);
  });

  it("is granted nothing beyond reading site content and public brand kits", () => {
    expect(
      publicRole.grants.filter(
        (g) =>
          (!SITE_CONTENT.includes(g.contentType) && g.contentType !== "BrandKit") ||
          g.actions.some((a) => a !== "read"),
      ),
    ).toEqual([]);
  });

  it.each(SITE_CONTENT)("reads %s", (contentType) => {
    expect(allows(publicRole, contentType, "read")).toBe(true);
  });

  it("holds one conditioned grant: reading brand kits marked public", () => {
    expect(publicRole.grants.filter((g) => g.condition !== undefined)).toEqual([
      { contentType: "BrandKit", actions: ["read"], condition: PUBLIC_KIT_CONDITION },
    ]);
  });

  it("reads a public brand kit, but never a private one", () => {
    expect(allows(publicRole, "BrandKit", "read", publicKitForGuest)).toBe(true);
    expect(allows(publicRole, "BrandKit", "read", privateKitForGuest)).toBe(false);
    expect(allows(publicRole, "BrandKit", "read", { "record.ownerId": SOMEONE_ELSE })).toBe(false);
  });

  it("cannot create, change or delete a public brand kit", () => {
    for (const action of WRITES) {
      expect(allows(publicRole, "BrandKit", action, publicKitForGuest)).toBe(false);
    }
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

  it.each(OWNED)(
    "holds every %s grant that writes under the ownership condition",
    (contentType) => {
      const grants = authenticated.grants.filter((g) => g.contentType === contentType);
      expect(grants.length).toBeGreaterThan(0);
      for (const grant of grants.filter((g) => g.actions.some((a) => a !== "read"))) {
        expect(grant.condition).toEqual(OWNER_CONDITION);
      }
    },
  );

  it.each(OWNED.filter((t) => t !== "BrandKit"))(
    "holds every %s grant under the ownership condition",
    (contentType) => {
      for (const grant of authenticated.grants.filter((g) => g.contentType === contentType)) {
        expect(grant.condition).toEqual(OWNER_CONDITION);
      }
    },
  );

  it("holds brand kits under the ownership grant and a separate read-only grant of public ones", () => {
    expect(authenticated.grants.filter((g) => g.contentType === "BrandKit")).toEqual([
      {
        contentType: "BrandKit",
        actions: ["create", "read", "update", "delete"],
        condition: OWNER_CONDITION,
        assign: { owner: "user.id" },
      },
      { contentType: "BrandKit", actions: ["read"], condition: PUBLIC_KIT_CONDITION },
    ]);
  });

  it.each(OWNED)("fills the owner of a %s it creates from the session", (contentType) => {
    for (const grant of authenticated.grants.filter(
      (g) => g.contentType === contentType && g.actions.includes("create"),
    )) {
      expect(grant.assign).toEqual({ owner: "user.id" });
    }
  });

  it.each(OWNED)("cannot touch someone else's private %s", (contentType) => {
    for (const action of ACTIONS) {
      expect(allows(authenticated, contentType, action, theirs)).toBe(false);
      expect(allows(authenticated, contentType, action, theirPrivateKit)).toBe(false);
    }
  });

  it("reads someone else's public brand kit, but cannot change or delete it", () => {
    expect(allows(authenticated, "BrandKit", "read", theirPublicKit)).toBe(true);
    for (const action of WRITES) {
      expect(allows(authenticated, "BrandKit", action, theirPublicKit)).toBe(false);
    }
  });

  it("manages its own brand kit whether it is public or not", () => {
    for (const kit of [myPrivateKit, myPublicKit]) {
      for (const action of ["create", "read", "update", "delete"] as const) {
        expect(allows(authenticated, "BrandKit", action, kit)).toBe(true);
      }
    }
  });

  it.each(OWNED)("cannot touch a private %s whose owner is unknown", (contentType) => {
    for (const action of ACTIONS) {
      expect(allows(authenticated, contentType, action, { "user.id": ME })).toBe(false);
      expect(allows(authenticated, contentType, action, { "record.ownerId": ME })).toBe(false);
      expect(
        allows(authenticated, contentType, action, { "user.id": ME, "record.isPublic": false }),
      ).toBe(false);
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

describe("brand kit ownership", () => {
  const brandKitGrants = roles.roles
    .filter((r) => r.admin !== true)
    .flatMap((r) => r.grants.filter((g) => g.contentType === "BrandKit"));

  it("fills the owner from the session on every grant that creates, so a client cannot set it", () => {
    const creating = brandKitGrants.filter((g) => g.actions.includes("create"));
    expect(creating.length).toBeGreaterThan(0);
    for (const grant of creating) expect(grant.assign).toEqual({ owner: "user.id" });
  });

  it("lets no grant but the owner's change or delete a kit, so the owner cannot be changed", () => {
    for (const grant of brandKitGrants.filter((g) => g.actions.some((a) => a !== "read"))) {
      expect(grant.condition).toEqual(OWNER_CONDITION);
    }
  });

  it("opens public kits to reading only, and only under the public condition", () => {
    const others = brandKitGrants.filter(
      (g) => JSON.stringify(g.condition) !== JSON.stringify(OWNER_CONDITION),
    );
    expect(others.length).toBeGreaterThan(0);
    for (const grant of others) {
      expect(grant).toEqual({
        contentType: "BrandKit",
        actions: ["read"],
        condition: PUBLIC_KIT_CONDITION,
      });
    }
  });

  // A populate of a kit's owner answers only what the caller may read of users and files.
  it.each(["User", "File"])(
    "lets no role but the admin read %s, so a populated owner shows nothing",
    (contentType) => {
      for (const role of [publicRole, authenticated]) {
        expect(allows(role, contentType, "read", theirPublicKit)).toBe(false);
        expect(allows(role, contentType, "read", publicKitForGuest)).toBe(false);
        expect(allows(role, contentType, "read")).toBe(false);
      }
    },
  );
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
