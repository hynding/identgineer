export interface FetchInit {
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly credentials: "omit";
  readonly mode: "cors";
  readonly referrerPolicy: "no-referrer";
  readonly cache: "no-store";
  readonly redirect: "error";
  readonly keepalive?: true;
}

export interface FetchResponseLike {
  readonly status: number;
  readonly headers: { readonly get: (name: string) => string | null };
}

export type FetchLike = (input: string, init: FetchInit) => Promise<FetchResponseLike>;

/** `navigator.sendBeacon`: true when the browser took the body, with no answer to read. */
export type SendBeaconLike = (url: string, data: string) => boolean;
