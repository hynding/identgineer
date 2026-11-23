// Wires both consent components on the page to one real tracker, served from this origin as plain
// modules (built into /tracking-sdk by the components build), so the strict policy holds. The page
// creates the tracker; the components never do.
import { createTracker } from "/tracking-sdk/index.js";
import { createFakeCollector } from "/tracking-sdk/testing/fake-collector.js";

const TAGS = ["idg-consent-banner", "idg-consent-preferences"];
const EVENTS = ["idgConsentChange", "idgConsentChoose"];
const WRITE_KEY = "wk_0123456789abcdef";
const params = new URLSearchParams(location.search);

const endpoint = new URL("/collect", location.href).href;
// `?fake-collector` answers from the SDK's own fake collector in the page; by default the tracker
// really posts to /collect, so a test sees every request at the network level.
const collector = params.has("fake-collector")
  ? createFakeCollector({ endpoint, writeKey: WRITE_KEY })
  : undefined;

// `?granted` and `?denied` stand for a visitor who chose on an earlier visit.
const seed = params.has("granted") ? "granted" : params.has("denied") ? "denied" : undefined;
if (seed !== undefined && localStorage.getItem("idg.tracking.consent.v1") === null) {
  localStorage.setItem(
    "idg.tracking.consent.v1",
    JSON.stringify({ state: seed, version: 1, decidedAt: Date.now() }),
  );
}

const tracker = createTracker({
  endpoint,
  writeKey: WRITE_KEY,
  consentVersion: 1,
  autoPageViews: false,
  events: { clicked: { properties: {} } },
  ...(collector ? { fetch: collector.fetch, sendBeacon: collector.sendBeacon } : {}),
});

const events = [];
for (const name of EVENTS) {
  document.addEventListener(name, (event) => {
    events.push({ type: event.type, detail: event.detail ?? null });
  });
}

await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
for (const element of document.querySelectorAll(TAGS.join(", "))) element.consent = tracker.consent;
if (params.has("announce")) document.getElementById("banner").announceSignal = true;

window.consentFixture = { tracker, events, collector };
document.documentElement.dataset.consentReady = "true";
