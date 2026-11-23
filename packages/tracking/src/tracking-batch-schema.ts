import {
  EVENT_NAME_PATTERN,
  IDENTIFIER_PATTERN,
  MAX_EVENTS_PER_BATCH,
  MAX_PATH_LENGTH,
  MAX_PROPERTIES_PER_EVENT,
  MAX_TIMESTAMP,
  MAX_WIRE_STRING_LENGTH,
  PATH_PATTERN,
  REFERRER_PATTERN,
  TOKEN_PATTERN,
  WIRE_VERSION,
  WRITE_KEY_PATTERN,
} from "./wire-format.ts";

const timestamp = { type: "integer", minimum: 0, maximum: MAX_TIMESTAMP } as const;
const token = { type: "string", pattern: TOKEN_PATTERN.source } as const;

/**
 * The batch as JSON Schema (draft 2020-12), for servers that validate with a schema. A test holds
 * it to `parseTrackingBatch`; the validator is the reference where the two could differ (a JSON
 * Schema cannot say that a string has no lone surrogate beyond what its own parser enforces, nor
 * that event ids are unique within a batch: the validator refuses a duplicate id).
 */
export const TRACKING_BATCH_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Identgineer tracking batch",
  type: "object",
  additionalProperties: false,
  required: ["v", "sentAt", "transport", "events"],
  properties: {
    v: { const: WIRE_VERSION },
    sentAt: timestamp,
    transport: { type: "string", pattern: "^(fetch|beacon)$" },
    writeKey: { type: "string", pattern: WRITE_KEY_PATTERN.source },
    events: {
      type: "array",
      minItems: 1,
      maxItems: MAX_EVENTS_PER_BATCH,
      items: { $ref: "#/$defs/event" },
    },
  },
  // The key travels in a beacon's body and in a fetch's header, so exactly one batch kind has it.
  oneOf: [
    { properties: { transport: { const: "beacon" } }, required: ["writeKey"] },
    { properties: { transport: { const: "fetch" } }, not: { required: ["writeKey"] } },
  ],
  $defs: {
    event: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "at"],
      properties: {
        id: token,
        name: { type: "string", pattern: EVENT_NAME_PATTERN.source },
        at: timestamp,
        session: token,
        user: { type: "string", pattern: IDENTIFIER_PATTERN.source },
        path: { type: "string", pattern: PATH_PATTERN.source, maxLength: MAX_PATH_LENGTH },
        referrer: { type: "string", pattern: REFERRER_PATTERN.source, maxLength: 260 },
        properties: {
          type: "object",
          maxProperties: MAX_PROPERTIES_PER_EVENT,
          propertyNames: { pattern: EVENT_NAME_PATTERN.source },
          additionalProperties: {
            type: ["string", "number", "boolean"],
            maxLength: MAX_WIRE_STRING_LENGTH,
          },
        },
      },
    },
  },
} as const;
