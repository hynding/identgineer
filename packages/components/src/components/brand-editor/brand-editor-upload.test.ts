import { SVG_LOGO_LIMITS } from "@identgineer/brand";
import { describe, expect, it, vi } from "vitest";
import { LogoUploads, type UploadFile } from "./brand-editor-upload";

const CLEAN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10" fill="#123456"/></svg>';
const WITH_SCRIPT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10"/><image href="https://example.com/track.png"/></svg>';
const ENTITIES =
  '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">&lol;</svg>';

const fileOf = (text: string | Uint8Array, type = "image/svg+xml") =>
  new File([text], "logo.svg", { type });

/** A file whose reading is held until the test lets it go, and which counts its reads. */
function heldFile(text: string): UploadFile & { release: () => void; reads: number } {
  let release = () => undefined as void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = new TextEncoder().encode(text);
  const file = {
    size: bytes.byteLength,
    reads: 0,
    release: () => {
      release();
    },
    async arrayBuffer() {
      file.reads += 1;
      await gate;
      return bytes.buffer;
    },
  };
  return file;
}

describe("LogoUploads", () => {
  it("accepts a clean logo as the sanitiser returns it, with nothing removed", async () => {
    const outcome = await new LogoUploads().upload("logo", fileOf(CLEAN));
    expect(outcome).toMatchObject({ kind: "accepted", removed: [], removedCount: 0 });
    if (outcome?.kind !== "accepted") throw new Error("not accepted");
    expect(outcome.svg).toContain('fill="#123456"');
    expect(outcome.svg).not.toBe(CLEAN);
  });

  it("accepts a logo with script, handlers and external references dropped, and lists what went", async () => {
    const outcome = await new LogoUploads().upload("mark", fileOf(WITH_SCRIPT));
    if (outcome?.kind !== "accepted") throw new Error("not accepted");
    expect(outcome.svg).not.toMatch(/script|onload|example\.com|image/);
    expect(outcome.removed.map((removal) => removal.reason).sort()).toEqual([
      "active-content",
      "event-handler",
      "external-reference",
    ]);
    expect(outcome.removedCount).toBe(3);
  });

  it("refuses what the sanitiser refuses, by its code", async () => {
    const uploads = new LogoUploads();
    expect(await uploads.upload("logo", fileOf(ENTITIES))).toEqual({
      kind: "refused",
      code: "doctype",
    });
    expect(await uploads.upload("logo", fileOf("not svg at all"))).toEqual({
      kind: "refused",
      code: "malformed",
    });
    expect(await uploads.upload("logo", fileOf(new Uint8Array([0x3c, 0xff, 0xfe])))).toEqual({
      kind: "refused",
      code: "invalid-encoding",
    });
  });

  it("refuses a file over the sanitiser's byte limit by its size, without reading a byte of it", async () => {
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const huge = { size: SVG_LOGO_LIMITS.inputBytes + 1, arrayBuffer };
    expect(await new LogoUploads().upload("logo", huge)).toEqual({
      kind: "refused",
      code: "too-large",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    const enormous = { size: Number.MAX_SAFE_INTEGER, arrayBuffer };
    expect(await new LogoUploads().upload("logo", enormous)).toMatchObject({ code: "too-large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("reads a file exactly at the limit", async () => {
    const padding = " ".repeat(SVG_LOGO_LIMITS.inputBytes - CLEAN.length);
    const file = fileOf(CLEAN.replace("<rect", `${padding}<rect`));
    expect(file.size).toBe(SVG_LOGO_LIMITS.inputBytes);
    expect(await new LogoUploads().upload("logo", file)).toMatchObject({ kind: "accepted" });
  });

  it("trusts neither the type nor the name: a file called a PNG is read as what it holds", async () => {
    const outcome = await new LogoUploads().upload(
      "logo",
      new File([CLEAN], "photo.png", { type: "image/png" }),
    );
    expect(outcome).toMatchObject({ kind: "accepted" });
    const html = await new LogoUploads().upload(
      "logo",
      new File(["<html><script>alert(1)</script></html>"], "logo.svg", { type: "image/svg+xml" }),
    );
    expect(html).toEqual({ kind: "refused", code: "not-svg" });
  });

  it("refuses a size that is not a number, and a file it cannot read, without throwing", async () => {
    const uploads = new LogoUploads();
    const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    for (const size of [Number.NaN, -1, "10", undefined]) {
      expect(await uploads.upload("logo", { size, arrayBuffer } as unknown as UploadFile)).toEqual({
        kind: "refused",
        code: "too-large",
      });
    }
    expect(arrayBuffer).not.toHaveBeenCalled();
    const broken = { size: 10, arrayBuffer: () => Promise.reject(new Error("NotReadableError")) };
    expect(await uploads.upload("logo", broken)).toEqual({ kind: "refused", code: "unreadable" });
    const throwing = {
      size: 10,
      arrayBuffer: () => {
        throw new Error("no");
      },
    };
    expect(await uploads.upload("logo", throwing)).toEqual({ kind: "refused", code: "unreadable" });
    expect(await uploads.upload("logo", null as unknown as UploadFile)).toEqual({
      kind: "refused",
      code: "too-large",
    });
  });

  it("drops the answer of an earlier read once a later upload of the same field has started", async () => {
    const uploads = new LogoUploads();
    const first = heldFile(WITH_SCRIPT);
    const earlier = uploads.upload("logo", first);
    const later = await uploads.upload("logo", fileOf(CLEAN));
    first.release();
    expect(later).toMatchObject({ kind: "accepted", removedCount: 0 });
    expect(await earlier).toBeUndefined();
  });

  it("keeps the fields apart: an upload of the mark leaves a read of the logo current", async () => {
    const uploads = new LogoUploads();
    const held = heldFile(CLEAN);
    const logo = uploads.upload("logo", held);
    await uploads.upload("mark", fileOf(CLEAN));
    held.release();
    expect(await logo).toMatchObject({ kind: "accepted" });
  });

  it("drops a late answer after the field was removed, or after everything was cancelled", async () => {
    const uploads = new LogoUploads();
    const held = heldFile(CLEAN);
    const pending = uploads.upload("mark", held);
    uploads.cancel("mark");
    held.release();
    expect(await pending).toBeUndefined();

    const again = heldFile(CLEAN);
    const another = uploads.upload("logo", again);
    uploads.cancelAll();
    again.release();
    expect(await another).toBeUndefined();
  });

  it("says whether a read of a field is under way", async () => {
    const uploads = new LogoUploads();
    const held = heldFile(CLEAN);
    const pending = uploads.upload("logo", held);
    expect(uploads.reading("logo")).toBe(true);
    expect(uploads.reading("mark")).toBe(false);
    held.release();
    await pending;
    expect(uploads.reading("logo")).toBe(false);
  });
});
