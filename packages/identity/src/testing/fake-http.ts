/** A request as the fake identity API saw it. */
export interface FakeRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly credentials: RequestCredentials;
  readonly redirect: RequestRedirect;
  readonly body: unknown;
}

export interface FakeCookie {
  readonly name: string;
  /** null clears the cookie. */
  readonly value: string | null;
}

/** An answer of the fake API, before it becomes a `Response`. */
export interface FakeResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly cookies?: readonly FakeCookie[];
}

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export const ok = (body: unknown, extra: Omit<FakeResponse, "status" | "body"> = {}) => ({
  status: 200,
  body,
  ...extra,
});

/** Strapi's error envelope. */
export const strapiError = (
  status: number,
  name: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): FakeResponse => ({
  status,
  body: { data: null, error: { status, name, message, details } },
});

export const applicationError = (message: string): FakeResponse =>
  strapiError(400, "ApplicationError", message);

/** users-permissions' yup validation failure: one message, or a count, and each field's error. */
export const validationError = (errors: readonly FieldError[]): FakeResponse => {
  const message =
    errors.length > 1 ? `${String(errors.length)} errors occurred` : (errors[0]?.message ?? "");
  return strapiError(400, "ValidationError", message, {
    errors: errors.map((error) => ({
      path: [error.field],
      message: error.message,
      name: "ValidationError",
    })),
  });
};

export const forbidden = (): FakeResponse => strapiError(403, "ForbiddenError", "Forbidden");

export const unauthorized = (): FakeResponse =>
  strapiError(401, "UnauthorizedError", "Missing or invalid credentials");

export const notFound = (message = "Not Found"): FakeResponse =>
  strapiError(404, "NotFoundError", message);
