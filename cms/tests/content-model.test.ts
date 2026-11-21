import { describe, expect, it } from "vitest";
import { contentTypeNamed, loadIr, type Field } from "./model";

const ir = loadIr();
const OWNED = ["Profile", "BrandKit", "Property", "Event", "ConsentRecord"];
const INGESTED = ["Event", "ConsentRecord"];

/** Field names that would hold identifying data the tracking model must never keep. */
const IDENTIFYING =
  /(^ip$|^ip[A-Z]|ipAddress|address|userAgent|agent|^ua$|email|phone|fingerprint|cookie|latitude|longitude|geo|city|postcode|zip|fullName|firstName|lastName)/i;

const fieldOf = (contentType: string, name: string): Field => {
  const field = contentTypeNamed(ir, contentType).fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`${contentType} has no "${name}" field`);
  return field;
};

const matcher = (contentType: string, name: string): RegExp => {
  const { pattern } = fieldOf(contentType, name);
  if (pattern === undefined) throw new Error(`${contentType}.${name} has no pattern`);
  return new RegExp(pattern);
};

describe("camis.json", () => {
  it("is version 1 of the IR", () => {
    expect(ir.version).toBe(1);
  });

  it("declares the built-in user and media library", () => {
    expect(contentTypeNamed(ir, "User").builtin).toBe("user");
    expect(contentTypeNamed(ir, "File").builtin).toBe("file");
  });

  it.each(OWNED)("gives %s a required owner relation to the built-in user", (contentType) => {
    const owner = fieldOf(contentType, "owner");
    expect(owner.type).toBe("relation");
    expect(owner.target).toBe("User");
    expect(["manyToOne", "oneToOne"]).toContain(owner.relationKind);
    expect(owner.required).toBe(true);
  });

  it("keeps one profile per user", () => {
    expect(fieldOf("Profile", "owner").relationKind).toBe("oneToOne");
  });

  it.each(["Page", "NavigationItem"])("serves %s read-only through its content API", (name) => {
    expect(contentTypeNamed(ir, name).options?.apiActions).toEqual(["list", "read"]);
  });

  it("opens no content API action to the public by type option", () => {
    expect(ir.contentTypes.filter((ct) => ct.options?.publicApiActions !== undefined)).toEqual([]);
  });
});

describe("tracking data minimisation", () => {
  it.each(INGESTED)("%s has no field that could identify a visitor", (contentType) => {
    const names = contentTypeNamed(ir, contentType).fields.map((f) => f.name);
    expect(names.filter((name) => IDENTIFYING.test(name))).toEqual([]);
  });

  it.each(INGESTED)("%s has no email field", (contentType) => {
    expect(contentTypeNamed(ir, contentType).fields.filter((f) => f.type === "email")).toEqual([]);
  });

  it("would flag the identifying names it guards against", () => {
    for (const name of ["ip", "ipAddress", "userAgent", "ua", "email", "fingerprint", "city"]) {
      expect(IDENTIFYING.test(name)).toBe(true);
    }
  });

  it("keeps an event's path without its query string or fragment", () => {
    const path = matcher("Event", "path");
    expect(path.test("/pricing")).toBe(true);
    expect(path.test("/search?q=someone@example.com")).toBe(false);
    expect(path.test("/docs#install")).toBe(false);
    expect(path.test("https://example.com/pricing")).toBe(false);
  });

  it("keeps only the referrer's host", () => {
    const host = matcher("Event", "referrerHost");
    expect(host.test("news.example.com")).toBe(true);
    expect(host.test("https://news.example.com/story?id=1")).toBe(false);
    expect(host.test("news.example.com/story")).toBe(false);
  });

  it("keeps country as a two-letter code only", () => {
    const country = matcher("Event", "country");
    expect(country.test("NL")).toBe(true);
    expect(country.test("Amsterdam")).toBe(false);
  });

  it.each([
    ["Event", "sessionId"],
    ["ConsentRecord", "subjectId"],
  ])("takes %s.%s as an opaque random token, not an email", (contentType, name) => {
    const token = matcher(contentType, name);
    expect(token.test("3f9a0c4e7b1d2a6f8e0c")).toBe(true);
    expect(token.test("someone@example.com")).toBe(false);
    expect(token.test("short")).toBe(false);
  });
});

describe("event ingestion", () => {
  const endpoints = ir.endpoints ?? [];

  it.each(INGESTED)("serves %s read-only through its content API", (contentType) => {
    expect(contentTypeNamed(ir, contentType).options?.apiActions).toEqual(["list", "read"]);
  });

  it.each([
    ["Event", "/ingest/events"],
    ["ConsentRecord", "/ingest/consent"],
  ])("writes %s through a public POST %s endpoint", (contentType, path) => {
    const endpoint = endpoints.find((e) => e.contentType === contentType);
    expect(endpoint).toMatchObject({ method: "POST", path, public: true });
  });

  it("has no public endpoint other than the two ingestion ones", () => {
    expect(
      endpoints
        .filter((e) => e.public === true)
        .map((e) => e.name)
        .sort(),
    ).toEqual(["IngestEvent", "RecordConsent"]);
  });

  it("has no endpoint that reads", () => {
    expect(endpoints.filter((e) => e.method !== "POST")).toEqual([]);
  });

  it("scopes ingestion by a unique, prefixed public key on the property", () => {
    const key = fieldOf("Property", "ingestKey");
    expect(key.required).toBe(true);
    expect(key.unique).toBe(true);
    const pattern = matcher("Property", "ingestKey");
    expect(pattern.test("pk_4Fq9ZsY2mRb7Xc1Lp0Tw8N")).toBe(true);
    expect(pattern.test("sk_4Fq9ZsY2mRb7Xc1Lp0Tw8N")).toBe(false);
    expect(pattern.test("pk_short")).toBe(false);
  });

  it("allows only https origins on a property", () => {
    const origin = new RegExp(
      ir.components.find((c) => c.name === "AllowedOrigin")?.fields.find((f) => f.name === "origin")
        ?.pattern ?? "(?!)",
    );
    expect(origin.test("https://www.example.com")).toBe(true);
    expect(origin.test("https://localhost.example:8443")).toBe(true);
    expect(origin.test("http://www.example.com")).toBe(false);
    expect(origin.test("*")).toBe(false);
    expect(origin.test("https://www.example.com/path")).toBe(false);
  });
});

describe("media", () => {
  it.each([
    ["Profile", "avatar"],
    ["BrandKit", "logo"],
    ["BrandKit", "mark"],
  ])("%s.%s accepts images only", (contentType, name) => {
    expect(fieldOf(contentType, name).allowedTypes).toEqual(["image"]);
  });
});
