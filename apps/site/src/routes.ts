/** A path of the site: it starts and ends with a slash, and its file is `<path>index.html`. */
export type RoutePath = `/${string}`;

/** The Stencil component that draws a whole page, shell included. */
export type PageComponent = "site-home" | "site-content-page" | "site-not-found";

interface RouteFields {
  readonly path: RoutePath;
  /**
   * The page a section's pages sit under (the docs index for a guide): they are left out of the
   * site's navigation and listed, with links to the one before and after, in the section's own.
   */
  readonly parent?: RoutePath;
  /** The short name, in the navigation and in links to the page. */
  readonly label: string;
  /** The document title, before the site's name is added. */
  readonly title: string;
  /** The meta description, which search results and link previews show. */
  readonly description: string;
}

interface LivePage extends RouteFields {
  readonly status: "live";
  readonly component: "site-home";
}

/** A reading page, drawn by one component from the content page of its slug. */
export interface ContentRoute extends RouteFields {
  readonly status: "live";
  readonly component: "site-content-page";
  /** The slug of its content page, in the repository and in the CMS. */
  readonly content: string;
}

export type LiveRoute = LivePage | ContentRoute;

/**
 * A page a later task adds. It is listed so the home page can say it is coming, and it is left out
 * of the navigation and never linked until it is live, so no link on the site leads to a 404.
 */
export interface ComingRoute extends RouteFields {
  readonly status: "coming";
}

export type Route = LiveRoute | ComingRoute;

/**
 * Every page of the site, in navigation order. This is the one place a page is declared: the
 * prerenderer, the navigation and the home page's links all read it.
 */
export const ROUTES: readonly Route[] = [
  {
    path: "/",
    label: "Home",
    title: "Identgineer: identity, tracking and a UI that re-skins itself",
    description:
      "Accounts and sign-in, consent-first analytics, brand kits that become themes, and web components that take on any of 4,096 looks.",
    status: "live",
    component: "site-home",
  },
  {
    path: "/features/",
    label: "Features",
    title: "Features",
    description:
      "What Identgineer does, from sign-in and sessions to consent-first tracking, brand kits and the variation system.",
    status: "live",
    component: "site-content-page",
    content: "features",
  },
  {
    path: "/identity/",
    label: "Identity",
    title: "Identity",
    description:
      "User accounts, sign-in, sessions, password reset and profiles, as an SDK and as web components that run under a strict policy.",
    status: "live",
    component: "site-content-page",
    content: "identity",
  },
  {
    path: "/tracking/",
    label: "Tracking",
    title: "Tracking",
    description:
      "A privacy-first tracker that sends nothing until the visitor agrees, honours Global Privacy Control and keeps URLs to a path.",
    status: "live",
    component: "site-content-page",
    content: "tracking",
  },
  {
    path: "/components/",
    label: "Components",
    title: "Components",
    description:
      "Every idg- web component with its properties, slots, parts and live examples, generated from the component library itself.",
    status: "coming",
  },
  {
    path: "/variations/",
    label: "Variations",
    title: "Variations gallery",
    description:
      "Eight themes, eight design languages, eight layouts and eight UX modes, side by side and ready to mix.",
    status: "coming",
  },
  {
    path: "/docs/",
    label: "Docs",
    title: "Documentation",
    description:
      "Getting started, the theming guide and the security notes: how to adopt Identgineer in a page or an app.",
    status: "live",
    component: "site-content-page",
    content: "docs",
  },
  {
    path: "/docs/getting-started/",
    parent: "/docs/",
    label: "Getting started",
    title: "Getting started",
    description:
      "Build the packages, copy the tokens, the bootstrap script and the components to your site, and put a first themed page together.",
    status: "live",
    component: "site-content-page",
    content: "getting-started",
  },
  {
    path: "/docs/theming/",
    parent: "/docs/",
    label: "Theming guide",
    title: "Theming guide",
    description:
      "The four variation axes, the tokens behind them, a visitor's choice without a flash, and a theme of your own from a brand kit.",
    status: "live",
    component: "site-content-page",
    content: "theming",
  },
  {
    path: "/docs/security/",
    parent: "/docs/",
    label: "Security",
    title: "Security notes",
    description:
      "What the components, the identity client and the tracker do for a page's security, what they leave to your server, and how to report a flaw.",
    status: "live",
    component: "site-content-page",
    content: "security",
  },
  {
    path: "/sandbox/",
    label: "Sandbox",
    title: "Sandbox",
    description:
      "A testbed where every component runs against fake backends, so you can try sign-in, consent and dashboards without a server.",
    status: "coming",
  },
];

/** The page a server sends for a path the site does not have. */
export interface NotFoundPage {
  readonly path?: undefined;
  readonly file: "404.html";
  readonly component: "site-not-found";
  readonly title: string;
  readonly description: string;
}

export const NOT_FOUND_PAGE: NotFoundPage = {
  file: "404.html",
  component: "site-not-found",
  title: "Page not found",
  description: "There is no page at this address. The home page lists everything the site has.",
};

/** A file the prerenderer writes, and the route it is the page of (none for the 404 page). */
export interface PrerenderedPage {
  readonly file: string;
  readonly path: RoutePath | undefined;
  readonly component: PageComponent;
  /** The slug of the content page a reading page is drawn from. */
  readonly content?: string;
  readonly title: string;
  readonly description: string;
}

/** `/` is `index.html` and `/docs/` is `docs/index.html`: each route is a folder with its own page. */
export function pageFile(path: RoutePath): string {
  return `${path.slice(1)}index.html`;
}

function isLive(route: Route): route is LiveRoute {
  return route.status === "live";
}

/** The live pages of the site's navigation and footer: every top-level one, in table order. */
export function navigationRoutes(): readonly LiveRoute[] {
  return ROUTES.filter(isLive).filter((route) => route.parent === undefined);
}

/** Every live path, a section's pages among them: what a link of the site may point to. */
export function livePaths(): ReadonlySet<string> {
  return new Set(ROUTES.filter(isLive).map((route) => route.path));
}

/** The pages of the section a path is in (its top page, then the pages under it), or none. */
export function sectionOf(path: RoutePath): readonly LiveRoute[] {
  const route = ROUTES.find((candidate) => candidate.path === path);
  const top = route?.parent ?? path;
  const pages = ROUTES.filter(isLive).filter((candidate) => candidate.parent === top);
  if (pages.length === 0) return [];
  const head = ROUTES.filter(isLive).find((candidate) => candidate.path === top);
  return head ? [head, ...pages] : pages;
}

/** The pages before and after a path in its section, where there are any. */
export function neighboursOf(path: RoutePath): {
  readonly previous?: LiveRoute;
  readonly next?: LiveRoute;
} {
  const section = sectionOf(path);
  const index = section.findIndex((route) => route.path === path);
  if (index < 0) return {};
  const previous = section[index - 1];
  const next = section[index + 1];
  return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) };
}

/**
 * The overview of the features, which leads the home page's links: its card spans two columns and
 * lists what the features cover, whether the page is live yet or coming.
 */
export function isOverview(route: Route): boolean {
  return route.path === "/features/";
}

/** The routes the home page points to: every top-level one but itself, live or coming. */
export function linkableRoutes(): readonly Route[] {
  return ROUTES.filter((route) => route.path !== "/" && route.parent === undefined);
}

export function prerenderedPages(): readonly PrerenderedPage[] {
  const routes = ROUTES.filter(isLive).map((route): PrerenderedPage => {
    const { path, component, title, description } = route;
    const page = { file: pageFile(path), path, component, title, description };
    return route.component === "site-content-page" ? { ...page, content: route.content } : page;
  });
  const { file, component, title, description } = NOT_FOUND_PAGE;
  return [...routes, { file, path: undefined, component, title, description }];
}
