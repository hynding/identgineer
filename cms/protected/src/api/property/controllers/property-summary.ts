import { handleSummary, type SummaryAnswer } from "../../../summary/handle-summary";
import {
  countEventsIn,
  findOwnedPropertyIn,
  type SummaryStrapiLike,
} from "../../../summary/strapi-summary-ports";

// Ring 2 endpoint — hand-written, from the seed camis wrote. Strapi answers
// GET /api/properties/:id/summary with it (api::property.property-summary.handle). Not public:
// Strapi authenticates the caller and asks its role before this runs (roles.json lists the endpoint
// for `authenticated` only), and camis' generated middleware applies the declared throttle first.
// The handler is the ownership check (cms/protected/README.md).

export interface SummaryContext {
  readonly params: Readonly<Record<string, unknown>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly state: { readonly user?: { readonly id?: unknown } | null };
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

const ERRORS = {
  400: ["ValidationError", "range must be 24h, 7d or 30d"],
  403: ["ForbiddenError", "Forbidden"],
  404: ["NotFoundError", "Not Found"],
  503: ["ServiceUnavailableError", "Service Unavailable"],
} as const;

const respond = (context: SummaryContext, answer: SummaryAnswer): void => {
  context.status = answer.status;
  if (answer.status === 200) {
    context.body = answer.body;
    return;
  }
  const [name, message] = ERRORS[answer.status];
  context.body = { data: null, error: { status: answer.status, name, message, details: {} } };
};

export default ({
  strapi,
}: {
  strapi: SummaryStrapiLike & { readonly log: { error(message: string): void } };
}) => {
  const ports = {
    findOwnedProperty: findOwnedPropertyIn(strapi),
    countEvents: countEventsIn(strapi),
    // The error's class only: its message holds the query and its bindings.
    reportFailure: (stage: "lookup" | "count", errorName: string) => {
      strapi.log.error(
        `PropertySummary: the database failed at the ${stage} (${errorName}); answered 503`,
      );
    },
    now: () => Date.now(),
  };
  return {
    async handle(context: SummaryContext): Promise<void> {
      // Every answer of the handler, refusals too: figures of one user's site are not for a cache.
      context.set("Cache-Control", "no-store");
      const answer = await handleSummary(
        {
          propertyId: context.params.id,
          range: context.query.range,
          userId: context.state.user?.id,
        },
        ports,
      );
      respond(context, answer);
    },
  };
};
