import { BrandKitStoreError } from "./brand-kit-store-error.ts";

const malformed = (): BrandKitStoreError => new BrandKitStoreError("malformed-response");

const isJson = (response: Response): boolean =>
  response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() === "application/json";

const cancel = (response: Response): void => {
  response.body?.cancel().catch(() => undefined);
};

const INITIAL_BUFFER_BYTES = 16 * 1024;

/**
 * Whether `signal` has aborted, read afresh: a function, so TypeScript does not carry a check made
 * before an await over to one made after it, when the signal may have aborted in between.
 */
export const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

/** `bytes` with room for at least `needed`, doubling so that many small chunks copy little. */
function grown(bytes: Uint8Array, used: number, needed: number, maxBytes: number): Uint8Array {
  const larger = new Uint8Array(Math.min(maxBytes, Math.max(needed, bytes.byteLength * 2)));
  larger.set(bytes.subarray(0, used));
  return larger;
}

/**
 * Reads at most `maxBytes` of the body, cancelling it as soon as it is longer or `signal` aborts:
 * a fetch may let go of the caller's signal once the headers are in (the identity SDK's
 * authorizedFetch does), so the store watches it itself. One listener serves the whole read:
 * cancelling the reader settles the pending read, which then sees the abort, so nothing is kept
 * per chunk however small the server makes them.
 */
async function readBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (declared > maxBytes) {
    cancel(response);
    throw malformed();
  }
  const body = response.body;
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const stop = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", stop);
  let bytes: Uint8Array = new Uint8Array(Math.min(maxBytes, INITIAL_BUFFER_BYTES));
  let total = 0;
  try {
    for (;;) {
      if (isAborted(signal)) throw new BrandKitStoreError("network");
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new BrandKitStoreError("network");
      }
      if (isAborted(signal)) throw new BrandKitStoreError("network");
      if (chunk.done) break;
      const needed = total + chunk.value.byteLength;
      if (needed > maxBytes) throw malformed();
      if (needed > bytes.byteLength) bytes = grown(bytes, total, needed, maxBytes);
      bytes.set(chunk.value, total);
      total = needed;
    }
  } catch (error) {
    reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
  }
  return bytes.subarray(0, total);
}

/**
 * A JSON answer's body as parsed data: refused as a malformed response unless it is declared as
 * `application/json`, fits in `maxBytes`, is UTF-8 and parses. `JSON.parse` makes a `__proto__`
 * key an own property like any other, so parsing pollutes nothing; readers check keys themselves.
 */
export async function readJsonAnswer(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!isJson(response)) {
    cancel(response);
    throw malformed();
  }
  const bytes = await readBytes(response, maxBytes, signal);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw malformed();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw malformed();
  }
}

/**
 * A failed answer's body, if it is small readable JSON; anything else is no body. An abort while
 * it is read still rejects as a network error, as it would for any other answer.
 */
export async function readFailureBody(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await readJsonAnswer(response, maxBytes, signal);
  } catch {
    if (isAborted(signal)) throw new BrandKitStoreError("network");
    return undefined;
  }
}

/** Drops a body that is not read, so the connection can be reused. */
export function discardBody(response: Response): void {
  cancel(response);
}
