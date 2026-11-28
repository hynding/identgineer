import { el, having, type ComponentExample, type ExampleElement } from "./component-example.ts";
import { SIGNED_OUT_CLIENT, UNDECIDED_CONSENT } from "./example-clients.ts";

/** A plain box to arrange: an outlined card with a word in it. */
const box = (text: string): ExampleElement =>
  el("idg-card", { variant: "outlined", padding: "sm" }, text);

const boxes = (...texts: string[]): ExampleElement[] => texts.map(box);

const SERIES = "38,41,37,52,49,61,58,66,63,71,69,84";

/**
 * A live example of every component the components package documents, by its tag. The reference
 * draws it on the component's page, with the usage snippet that its description writes, and a
 * test fails for a component without one. The examples follow the page's theme, design, layout and
 * UX mode because they are the real components on the page.
 */
export const COMPONENT_EXAMPLES = {
  "idg-accordion": {
    caption: "Two items, the first open.",
    nodes: [
      el(
        "idg-accordion",
        {},
        el("idg-accordion-item", { heading: "What is in the box?", open: true }, "The components."),
        el("idg-accordion-item", { heading: "Does it need a script?" }, "Only to open and close."),
      ),
    ],
  },
  "idg-accordion-item": {
    caption: "One item, open.",
    nodes: [
      el("idg-accordion-item", { heading: "Shipping", open: true }, "Orders leave within a day."),
    ],
  },
  "idg-alert": {
    caption: "A warning that can be dismissed.",
    nodes: [
      el(
        "idg-alert",
        { variant: "warning", dismissible: true },
        el("span", { slot: "title" }, "Heads up"),
        "Your plan renews tomorrow.",
      ),
    ],
  },
  "idg-avatar": {
    caption: "A person's initials, with their status.",
    nodes: [el("idg-avatar", { name: "Ada Lovelace", size: "lg", status: "online" })],
  },
  "idg-avatar-group": {
    caption: "Five people, three shown.",
    nodes: [
      el(
        "idg-avatar-group",
        { max: "3", label: "Team" },
        el("idg-avatar", { name: "Ada Lovelace" }),
        el("idg-avatar", { name: "Grace Hopper" }),
        el("idg-avatar", { name: "Alan Turing" }),
        el("idg-avatar", { name: "Edsger Dijkstra" }),
        el("idg-avatar", { name: "Barbara Liskov" }),
      ),
    ],
  },
  "idg-badge": {
    caption: "Each variant.",
    nodes: [
      el("idg-badge", {}, "Neutral"),
      el("idg-badge", { variant: "accent" }, "Accent"),
      el("idg-badge", { variant: "success", dot: true }, "Active"),
      el("idg-badge", { variant: "danger" }, "Failed"),
    ],
  },
  "idg-brand-editor": {
    caption: "The editor as it opens, before a kit is given to it.",
    inert: true,
    nodes: [el("idg-brand-editor", { label: "Brand kit" })],
  },
  "idg-brand-export": {
    caption: "The export panel before a theme is given to it.",
    inert: true,
    nodes: [el("idg-brand-export", { label: "Export your theme" })],
  },
  "idg-brand-guidelines": {
    caption: "The guidelines before a kit is given to them.",
    inert: true,
    nodes: [el("idg-brand-guidelines", { label: "Brand guidelines" })],
  },
  "idg-brand-logo": {
    caption: "A brand with no logo yet, drawn as its name.",
    nodes: [el("idg-brand-logo", { name: "Acme Rockets", size: "lg" })],
  },
  "idg-brand-swatches": {
    caption: "The swatches before a theme is given to them.",
    inert: true,
    nodes: [el("idg-brand-swatches", { label: "Brand colours" })],
  },
  "idg-breadcrumb": {
    caption: "A trail of three steps.",
    nodes: [
      el(
        "idg-breadcrumb",
        { label: "You are here" },
        el("idg-breadcrumb-item", { href: "/" }, "Home"),
        el("idg-breadcrumb-item", { href: "/components/" }, "Components"),
        el("idg-breadcrumb-item", { current: true }, "Breadcrumb"),
      ),
    ],
  },
  "idg-breadcrumb-item": {
    caption: "Steps with a slash between them.",
    nodes: [
      el(
        "idg-breadcrumb",
        { label: "Trail", separator: "slash" },
        el("idg-breadcrumb-item", { href: "/" }, "Home"),
        el("idg-breadcrumb-item", { current: true }, "Profile"),
      ),
    ],
  },
  "idg-button": {
    caption: "Each variant, and one that is loading.",
    nodes: [
      el("idg-button", {}, "Save"),
      el("idg-button", { variant: "secondary" }, "Cancel"),
      el("idg-button", { variant: "ghost" }, "Skip"),
      el("idg-button", { variant: "danger" }, "Delete"),
      el("idg-button", { loading: true }, "Saving"),
    ],
  },
  "idg-card": {
    caption: "A raised card with a heading and an action.",
    nodes: [
      el(
        "idg-card",
        { variant: "raised", heading: "Starter plan" },
        el("p", {}, "Everything a small site needs."),
        el("idg-button", { slot: "footer", size: "sm" }, "Choose"),
      ),
    ],
  },
  "idg-checkbox": {
    caption: "A checked box and one left open.",
    nodes: [
      el("idg-checkbox", { checked: true }, "Send me the newsletter"),
      el("idg-checkbox", {}, "Remember me"),
    ],
  },
  "idg-cluster": {
    caption: "Badges that wrap onto the next line as the room runs out.",
    nodes: [
      el(
        "idg-cluster",
        { gap: "xs" },
        el("idg-badge", {}, "Identity"),
        el("idg-badge", {}, "Tracking"),
        el("idg-badge", {}, "Brand kits"),
        el("idg-badge", {}, "Variations"),
      ),
    ],
  },
  "idg-consent-banner": {
    caption: "The banner in the page's flow, before anyone has chosen.",
    inert: true,
    nodes: [
      having(el("idg-consent-banner", { placement: "inline" }), { consent: UNDECIDED_CONSENT }),
    ],
  },
  "idg-consent-preferences": {
    caption: "The preferences panel before a consent object is given to it.",
    inert: true,
    nodes: [
      having(el("idg-consent-preferences", { "heading-level": "3" }), {
        consent: UNDECIDED_CONSENT,
      }),
    ],
  },
  "idg-cover": {
    caption: "Content centred in a block, with a region pinned to each edge.",
    nodes: [
      el(
        "idg-cover",
        { "min-height": "s" },
        el("p", { slot: "top" }, "Top"),
        el("strong", {}, "Centred"),
        el("p", { slot: "bottom" }, "Bottom"),
      ),
    ],
  },
  "idg-dialog": {
    caption: "A modal dialog, closed until it is opened with its showModal() method.",
    opener: { label: "Open the dialog", method: "showModal" },
    nodes: [
      el(
        "idg-dialog",
        { heading: "Discard the draft?", size: "sm" },
        "The changes you made will be lost.",
        el("idg-button", { slot: "footer", variant: "secondary" }, "Keep editing"),
      ),
    ],
  },
  "idg-divider": {
    caption: "A rule between two paragraphs.",
    nodes: [el("p", {}, "Above"), el("idg-divider"), el("p", {}, "Below")],
  },
  "idg-event-table": {
    caption: "The table while its events are loading.",
    nodes: [el("idg-event-table", { caption: "Recent events", loading: true })],
  },
  "idg-field": {
    caption: "A labelled input with a hint.",
    nodes: [
      el(
        "idg-field",
        { label: "Email", hint: "We only use it to sign you in." },
        el("idg-input", { type: "email", placeholder: "you@example.com" }),
      ),
    ],
  },
  "idg-grid": {
    caption: "Boxes in as many columns as the room holds.",
    nodes: [el("idg-grid", { min: "xs", gap: "s" }, ...boxes("One", "Two", "Three", "Four"))],
  },
  "idg-icon": {
    caption: "A few of the icons.",
    nodes: ["check", "bell", "search", "settings", "user"].map((name) =>
      el("idg-icon", { name, size: "lg" }),
    ),
  },
  "idg-input": {
    caption: "A search input, in a field that names it.",
    nodes: [
      el(
        "idg-field",
        { label: "Search" },
        el("idg-input", { type: "search", placeholder: "Search the docs" }),
      ),
    ],
  },
  "idg-layout": {
    caption: "The page shell with a brand, navigation and content, inside this page.",
    inert: true,
    nodes: [
      el(
        "idg-layout",
        { embedded: true },
        el("span", { slot: "brand" }, "Acme"),
        el("a", { slot: "navigation", href: "/" }, "Home"),
        el("a", { slot: "navigation", href: "/features/" }, "Features"),
        el("p", {}, "The page's content."),
      ),
    ],
  },
  "idg-link": {
    caption: "A link, and one that leaves the site.",
    nodes: [
      el("idg-link", { href: "/docs/" }, "Read the docs"),
      el("idg-link", { href: "/docs/security/", external: true }, "Security notes"),
    ],
  },
  "idg-menu": {
    caption: "A button that opens a menu of actions.",
    nodes: [
      el(
        "idg-menu",
        { label: "Actions" },
        el("idg-button", { slot: "trigger", variant: "secondary" }, "Actions"),
        el("idg-menu-item", {}, "Rename"),
        el("idg-menu-item", {}, "Duplicate"),
        el("idg-menu-item", {}, "Archive"),
      ),
    ],
  },
  "idg-menu-group": {
    caption: "A menu with its items in two labelled groups.",
    nodes: [
      el(
        "idg-menu",
        { label: "Share" },
        el("idg-button", { slot: "trigger", variant: "secondary" }, "Share"),
        el("idg-menu-group", { label: "Send" }, el("idg-menu-item", {}, "By email")),
        el("idg-menu-group", { label: "Copy" }, el("idg-menu-item", {}, "Link")),
      ),
    ],
  },
  "idg-menu-item": {
    caption: "Items that are choices: one checked, one a link.",
    nodes: [
      el(
        "idg-menu",
        { label: "View" },
        el("idg-button", { slot: "trigger", variant: "secondary" }, "View"),
        el("idg-menu-item", { type: "checkbox", checked: true }, "Show grid"),
        el("idg-menu-item", { href: "/docs/" }, "Open the docs"),
      ),
    ],
  },
  "idg-menu-separator": {
    caption: "A rule between two kinds of action.",
    nodes: [
      el(
        "idg-menu",
        { label: "File" },
        el("idg-button", { slot: "trigger", variant: "secondary" }, "File"),
        el("idg-menu-item", {}, "Save"),
        el("idg-menu-separator"),
        el("idg-menu-item", {}, "Delete"),
      ),
    ],
  },
  "idg-pagination": {
    caption: "Page 4 of 12.",
    nodes: [el("idg-pagination", { page: "4", "page-count": "12" })],
  },
  "idg-password-reset": {
    caption: "The request step, inert: it sends nothing.",
    inert: true,
    nodes: [el("idg-password-reset")],
  },
  "idg-popover": {
    caption: "A button that opens a surface of content.",
    nodes: [
      el(
        "idg-popover",
        {},
        el("idg-button", { slot: "trigger", variant: "secondary" }, "Details"),
        el("p", {}, "Anything may go in a popover, links and buttons included."),
      ),
    ],
  },
  "idg-profile": {
    caption: "The profile panel, inert: it needs a signed-in client.",
    inert: true,
    nodes: [el("idg-profile", { "heading-level": "3" })],
  },
  "idg-progress": {
    caption: "Progress with its value shown.",
    nodes: [el("idg-progress", { label: "Upload", value: "64", "show-value": true })],
  },
  "idg-property-picker": {
    caption: "The picker before it has any properties.",
    nodes: [el("idg-property-picker", { label: "Site" })],
  },
  "idg-radio": {
    caption: "Radios in a group, the second chosen.",
    nodes: [
      el(
        "idg-radio-group",
        { name: "size", value: "m" },
        el("idg-radio", { value: "s" }, "Small"),
        el("idg-radio", { value: "m" }, "Medium"),
        el("idg-radio", { value: "l" }, "Large"),
      ),
    ],
  },
  "idg-radio-group": {
    caption: "A group laid out in a row.",
    nodes: [
      el(
        "idg-radio-group",
        { name: "plan", orientation: "horizontal", value: "monthly" },
        el("idg-radio", { value: "monthly" }, "Monthly"),
        el("idg-radio", { value: "yearly" }, "Yearly"),
      ),
    ],
  },
  "idg-register": {
    caption: "The registration form, inert: it sends nothing.",
    inert: true,
    nodes: [el("idg-register")],
  },
  "idg-select": {
    caption: "A select in a field that names it.",
    nodes: [
      el(
        "idg-field",
        { label: "Country" },
        el(
          "idg-select",
          { value: "se" },
          el("option", { value: "se" }, "Sweden"),
          el("option", { value: "no" }, "Norway"),
          el("option", { value: "fi" }, "Finland"),
        ),
      ),
    ],
  },
  "idg-session-guard": {
    caption: "What a visitor sees while nobody is signed in.",
    nodes: [
      having(
        el(
          "idg-session-guard",
          {},
          el("p", {}, "Only for people who are signed in."),
          el("p", { slot: "fallback" }, "Sign in to see this."),
        ),
        { client: SIGNED_OUT_CLIENT },
      ),
    ],
  },
  "idg-sidebar": {
    caption: "A side region beside the content, which stack when the room is short.",
    nodes: [
      el(
        "idg-sidebar",
        { "side-width": "s", gap: "s" },
        el("idg-card", { slot: "side", variant: "outlined", padding: "sm" }, "Side"),
        el("idg-card", { variant: "outlined", padding: "sm" }, "Content"),
      ),
    ],
  },
  "idg-sign-in": {
    caption: "The sign-in form, inert: it sends nothing.",
    inert: true,
    nodes: [el("idg-sign-in")],
  },
  "idg-skeleton": {
    caption: "Three lines of text still to arrive.",
    nodes: [el("idg-skeleton", { lines: "3" })],
  },
  "idg-sparkline": {
    caption: "A trend of twelve days, with its area filled.",
    nodes: [el("idg-sparkline", { values: SERIES, label: "Visitors per day", area: true })],
  },
  "idg-stack": {
    caption: "Boxes one under another with a gap.",
    nodes: [el("idg-stack", { gap: "s" }, ...boxes("One", "Two", "Three"))],
  },
  "idg-stat": {
    caption: "A figure with how it changed, and a chart beside it.",
    nodes: [
      el(
        "idg-stat",
        { label: "Page views", value: "48,210", delta: "12.4%", direction: "up" },
        el("idg-sparkline", { slot: "chart", values: SERIES, label: "Page views per day" }),
      ),
    ],
  },
  "idg-switch": {
    caption: "A switch that is on, and one that is off.",
    nodes: [
      el("idg-switch", { checked: true }, "Notifications"),
      el("idg-switch", {}, "Dark mode"),
    ],
  },
  "idg-switcher": {
    caption: "Items in one row that become a column where the room is short.",
    nodes: [el("idg-switcher", { threshold: "m", gap: "s" }, ...boxes("One", "Two", "Three"))],
  },
  "idg-tab": {
    caption: "Tabs down the side of their panel.",
    nodes: [
      el(
        "idg-tabs",
        { label: "Account", orientation: "vertical", value: "profile" },
        el("idg-tab", { slot: "tab", value: "profile" }, "Profile"),
        el("idg-tab", { slot: "tab", value: "security" }, "Security"),
        el("idg-tab-panel", { value: "profile" }, "Your name and photo."),
        el("idg-tab-panel", { value: "security" }, "Password and sessions."),
      ),
    ],
  },
  "idg-tab-panel": {
    caption: "A panel for each tab, the one of the selected tab shown.",
    nodes: [
      el(
        "idg-tabs",
        { label: "Plans", value: "free" },
        el("idg-tab", { slot: "tab", value: "free" }, "Free"),
        el("idg-tab", { slot: "tab", value: "pro" }, "Pro"),
        el("idg-tab-panel", { value: "free" }, "For trying it out."),
        el("idg-tab-panel", { value: "pro" }, "For teams."),
      ),
    ],
  },
  "idg-table": {
    caption: "A native table, striped, in a scroll region.",
    nodes: [
      el(
        "idg-table",
        { striped: true },
        el(
          "table",
          {},
          el("caption", {}, "Plans"),
          el(
            "thead",
            {},
            el("tr", {}, el("th", { scope: "col" }, "Plan"), el("th", { scope: "col" }, "Seats")),
          ),
          el(
            "tbody",
            {},
            el("tr", {}, el("td", {}, "Free"), el("td", {}, "1")),
            el("tr", {}, el("td", {}, "Team"), el("td", {}, "10")),
            el("tr", {}, el("td", {}, "Company"), el("td", {}, "100")),
          ),
        ),
      ),
    ],
  },
  "idg-tabs": {
    caption: "Three tabs, the first selected.",
    nodes: [
      el(
        "idg-tabs",
        { label: "Sections", value: "one" },
        el("idg-tab", { slot: "tab", value: "one" }, "One"),
        el("idg-tab", { slot: "tab", value: "two" }, "Two"),
        el("idg-tab", { slot: "tab", value: "three" }, "Three"),
        el("idg-tab-panel", { value: "one" }, "The first panel."),
        el("idg-tab-panel", { value: "two" }, "The second panel."),
        el("idg-tab-panel", { value: "three" }, "The third panel."),
      ),
    ],
  },
  "idg-textarea": {
    caption: "A textarea with a character counter, in a field that names it.",
    nodes: [
      el(
        "idg-field",
        { label: "Message" },
        el("idg-textarea", { counter: true, maxlength: "140", rows: "3" }),
      ),
    ],
  },
  "idg-toast": {
    caption: "A toast with an action, drawn where it stands.",
    nodes: [
      el("idg-toast", {
        heading: "Saved",
        description: "Your changes are live.",
        variant: "success",
        "action-label": "Undo",
        paused: true,
      }),
    ],
  },
  "idg-toast-region": {
    caption: "The corner toasts appear in, with one toast waiting.",
    inert: true,
    nodes: [
      el(
        "idg-toast-region",
        { position: "bottom-start", embedded: true },
        el("idg-toast", { heading: "Welcome back", variant: "info" }),
      ),
    ],
  },
  "idg-tooltip": {
    caption: "A hint on hover and on focus.",
    nodes: [
      el(
        "idg-tooltip",
        { text: "Saves your changes" },
        el("idg-button", { variant: "secondary" }, "Save"),
      ),
    ],
  },
  "idg-user-menu": {
    caption: "The user menu while nobody is signed in.",
    inert: true,
    nodes: [
      having(
        el("idg-user-menu", {}, el("idg-link", { slot: "signed-out", href: "/" }, "Sign in")),
        { client: SIGNED_OUT_CLIENT },
      ),
    ],
  },
  "idg-variation-switcher": {
    caption: "The real switcher: it changes this page's look.",
    nodes: [el("idg-variation-switcher", { orientation: "inline", axes: "theme,layout" })],
  },
} as const satisfies Readonly<Record<string, ComponentExample>>;

export type ComponentExampleName = keyof typeof COMPONENT_EXAMPLES;

export const COMPONENT_EXAMPLE_NAMES = Object.keys(COMPONENT_EXAMPLES) as ComponentExampleName[];
