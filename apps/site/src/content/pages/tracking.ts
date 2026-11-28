import {
  bullets,
  code,
  example,
  h2,
  link,
  note,
  p,
  page,
  repository,
  sample,
  table,
} from "../authoring.ts";

export const TRACKING = page({
  slug: "tracking",
  title: "Analytics that ask first",
  summary:
    "A tracker that sends nothing until the visitor agrees, a consent banner and preferences panel, and dashboard components that read the figures back.",
  body: [
    p(
      code("@identgineer/tracking"),
      " honours Global Privacy Control and Do Not Track, collects only the events a page declares and cuts every URL down to its path. It uses no cookie, keeps no identifier that outlives a tab and has no runtime dependencies.",
    ),
    h2("Use it"),
    sample(
      "ts",
      `
import { createTracker } from "@identgineer/tracking";

const tracker = createTracker({
  endpoint: "https://collect.example.com/v1/events",
  writeKey: "wk_0123456789abcdef", // public and write-only
  consentVersion: 1,
  autoPageViews: true,
  events: {
    signup_completed: { properties: { plan: "string", seats: "number" } },
  },
});

tracker.consent.grant(); // called by your consent banner
tracker.track("signup_completed", { plan: "pro", seats: 3 });
`,
      "Declaring events and tracking one",
    ),
    p(
      "Against the CMS, point ",
      code("endpoint"),
      " at its ",
      code("/api/ingest/events"),
      " and use a tracked site's ingest key as the write key. After it is created the tracker never throws: a call it cannot honour is dropped and reported to ",
      code("onDrop"),
      ".",
    ),
    h2("What is collected, and what never is"),
    table(
      "What the tracker sends",
      ["Collected", "Never collected"],
      [
        [
          "The event's name and the properties the page declared for it",
          "Properties or events the page did not declare",
        ],
        [
          "The page's path, with only the query parameters the page lists",
          "The host, credentials, the fragment and every other query parameter",
        ],
        ["On a page view, the referrer's origin", "The referrer's path or query"],
        [
          "A random session id in session storage, replaced after 30 minutes idle",
          "A visitor id across sessions, a cookie, a fingerprint or a device id",
        ],
        [
          "An opaque user id, only if the page calls identify with one",
          "An email address or a name: identify refuses a value with an at sign",
        ],
      ],
    ),
    note(
      "Paths are yours to keep clean",
      "A path segment holding an at sign is replaced, but other identifiers in a path, such as an order number, cannot be recognised. Keep personal data out of your paths, or send a page view with a path you chose.",
    ),
    h2("Consent"),
    p(
      "Consent is unknown until the visitor chooses, and nothing is recorded until it is granted. Two elements ask for it and keep it, given the tracker's ",
      code("consent"),
      " object:",
    ),
    bullets(
      [
        code("idg-consent-banner"),
        " asks once and never under a privacy signal. Decline and Accept analytics have the same look and weight, and it is a region of the page, not a dialog, so it blocks nothing.",
      ],
      [
        code("idg-consent-preferences"),
        " shows the choice and when it was made, changes it, or withdraws it and erases what was kept.",
      ],
    ),
    h2("Reading it back"),
    p(
      "The dashboard components (a property picker, stat figures, sparklines and a sortable event table) take their data as properties and never fetch. The page asks a source the server controls and hands the answers over; ",
      code("@identgineer/tracking/dashboard"),
      " is that source over the CMS, read as the signed-in user, who sees only their own sites.",
    ),
    example("dashboard-figures", "Stat figures and sparklines, drawn from sample numbers."),
    h2("What the server must enforce"),
    p(
      "The write key is public, so it proves nothing on its own. The CMS's ingestion handlers enforce all of this:",
    ),
    bullets(
      "Requests only from the origins listed for the tracked site",
      "Rate limits per key and per client, answered with 429 and Retry-After",
      "Every batch checked against the wire format, with a cap on its size",
      "Events stored against the site the key belongs to, never one the body names",
      "No IP address or user agent stored with anything",
    ),
    p(
      "More in the ",
      link(repository("packages/tracking/README.md"), "tracking README"),
      " and the consent guides for ",
      link(repository("docs/consent/plain-html.md"), "plain HTML"),
      ", ",
      link(repository("docs/consent/react.md"), "React"),
      ", ",
      link(repository("docs/consent/vue.md"), "Vue"),
      " and ",
      link(repository("docs/consent/angular.md"), "Angular"),
      ".",
    ),
  ],
});
