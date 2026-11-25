import { BrandKitStoreError } from "./brand-kit-store-error.ts";

const malformed = (): BrandKitStoreError => new BrandKitStoreError("malformed-response");

const isJson = (response: Response): boolean =>
  response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() === "application/json";

const cancel = (response: Response): void => {
  response.body?.cancel().catch(() => undefined);
};

/** Rejects as soon as `signal` aborts; never settles otherwise. */
function abortion(signal: AbortSignal): { promise: Promise<never>; done: () => void } {
  let done = (): void => undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    const abort = (): void => {
      reject(new BrandKitStoreError("network"));
    };
    signal.addEventListener("abort", abort);
    done = () => {
      signal.removeEventListener("abort", abort);
    };
  });
  promise.catch(() => undefined);
  return { promise, done };
}

/**
 * Reads at most `maxBytes` of the body, cancelling it as soon as it is longer or `signal` aborts:
 * a fetch may let go of the caller's signal once the headers are in (the identity SDK's
 * authorizedFetch does), so the store watches it itself.
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
  const aborted = signal === undefined ? undefined : abortion(signal);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal?.aborted === true) throw new BrandKitStoreError("network");
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        const read = reader.read();
        chunk = await (aborted === undefined ? read : Promise.race([read, aborted.promise]));
      } catch (error) {
        throw error instanceof BrandKitStoreError ? error : new BrandKitStoreError("network");
      }
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) throw malformed();
      chunks.push(chunk.value);
    }
  } catch (error) {
    reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    aborted?.done();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
    if (signal?.aborted === true) throw new BrandKitStoreError("network");
    return undefined;
  }
}

/** Drops a body that is not read, so the connection can be reused. */
export function discardBody(response: Response): void {
  cancel(response);
}
