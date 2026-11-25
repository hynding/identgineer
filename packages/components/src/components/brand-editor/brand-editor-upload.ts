import type { SvgLogoErrorCode, SvgLogoRemoval } from "@identgineer/brand";
import { sanitiseSvgLogo, SVG_LOGO_LIMITS } from "@identgineer/brand/edit";
import type { ImageField } from "./brand-editor-draft";

/** What the editor reads of a chosen file: a `File` fits. Its name and type are never read. */
export interface UploadFile {
  readonly size: number;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
}

/** Why an upload was refused: the sanitiser's code, or `unreadable` when the file could not be read. */
export type UploadRefusalCode = SvgLogoErrorCode | "unreadable";

export type UploadOutcome =
  | {
      readonly kind: "accepted";
      /** The sanitiser's output, the only text of the upload that is ever kept. */
      readonly svg: string;
      /** What the sanitiser dropped, at most as many as it reports. */
      readonly removed: readonly SvgLogoRemoval[];
      readonly removedCount: number;
    }
  | { readonly kind: "refused"; readonly code: UploadRefusalCode };

const refused = (code: UploadRefusalCode): UploadOutcome => ({ kind: "refused", code });

function sizeOf(file: unknown): number | undefined {
  try {
    const size = (file as { size?: unknown } | null)?.size;
    return typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : undefined;
  } catch {
    return undefined;
  }
}

async function bytesOf(file: UploadFile): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return undefined;
  }
}

/**
 * Reads chosen logo files through the sanitiser, one field at a time. A file over the sanitiser's
 * byte limit is refused by its size before a byte is read, so a huge file never reaches memory;
 * the rest is read as bytes, which the sanitiser decodes itself (refusing what is not UTF-8), and
 * only its output is returned. Nothing is judged by the file's name or type.
 *
 * Reading takes time, so each field numbers its uploads: the answer of a read that a later upload
 * of the field, a removal (`cancel`) or the element leaving the page (`cancelAll`) has overtaken
 * comes back as `undefined`, to be dropped.
 */
export class LogoUploads {
  private readonly current: Record<ImageField, number> = { logo: 0, mark: 0 };
  private readonly busy: Record<ImageField, boolean> = { logo: false, mark: false };

  async upload(field: ImageField, file: UploadFile): Promise<UploadOutcome | undefined> {
    const attempt = (this.current[field] += 1);
    const size = sizeOf(file);
    if (size === undefined || size > SVG_LOGO_LIMITS.inputBytes) return refused("too-large");
    this.busy[field] = true;
    const bytes = await bytesOf(file);
    if (attempt !== this.current[field]) return undefined;
    this.busy[field] = false;
    if (bytes === undefined) return refused("unreadable");
    const result = sanitiseSvgLogo(bytes);
    if (!result.ok) return refused(result.errors[0]?.code ?? "malformed");
    return {
      kind: "accepted",
      svg: result.svg,
      removed: result.removed,
      removedCount: result.removedCount,
    };
  }

  /** Whether a file of the field is being read. */
  reading(field: ImageField): boolean {
    return this.busy[field];
  }

  /** Drops the answer of any read of the field still under way. */
  cancel(field: ImageField): void {
    this.current[field] += 1;
    this.busy[field] = false;
  }

  cancelAll(): void {
    this.cancel("logo");
    this.cancel("mark");
  }
}
