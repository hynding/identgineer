import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText, REVOKE_DELAY_MS, type DownloadAnchor } from "./download-text";

function anchor(click: () => void = () => undefined): DownloadAnchor {
  return { href: "", download: "", click };
}

describe("downloadText", () => {
  let created: Blob[];
  let revoked: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    revoked = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob);
      return `blob:test/${String(created.length)}`;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clicks an anchor that points at a blob of the text, with the type and the file name given", async () => {
    const link = anchor();
    const click = vi.spyOn(link, "click");
    const text = "a { color: red }\né <b>&</b>";
    expect(downloadText(link, text, "acme.css", "text/css")).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect(link.href).toBe("blob:test/1");
    expect(link.download).toBe("acme.css");
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe("text/css");
    expect(await created[0]?.text()).toBe(text);
  });

  it("sets the href and the name before the click, so the click downloads them", () => {
    const seen: string[] = [];
    const link = anchor(() => {
      seen.push(link.href, link.download);
    });
    downloadText(link, "{}", "acme.json", "application/json");
    expect(seen).toEqual(["blob:test/1", "acme.json"]);
    expect(created[0]?.type).toBe("application/json");
  });

  it("revokes the object url afterwards, not before the click has been handled", () => {
    downloadText(anchor(), "x", "a.css", "text/css");
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("revokes the url, and says it failed, when the click throws", () => {
    const link = anchor(() => {
      throw new Error("blocked");
    });
    expect(downloadText(link, "x", "a.css", "text/css")).toBe(false);
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoked).toEqual(["blob:test/1"]);
  });

  it("says it failed, and leaks nothing, when no object url can be made", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("no");
    });
    const link = anchor();
    const click = vi.spyOn(link, "click");
    expect(downloadText(link, "x", "a.css", "text/css")).toBe(false);
    expect(click).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoked).toEqual([]);
  });
});
