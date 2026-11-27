/** A path of the site: it starts and ends with a slash, and its file is `<path>index.html`. */
export type RoutePath = `/${string}`;

/** The Stencil component that draws a whole page, shell included. */
export type PageComponent = "site-home" | "site-not-found";

interface RouteFields {
  readonly path: RoutePath;
  /** The short name, in the navigation and in links to the page. */
  readonly label: string;
  /** The document title, before the site's name is added. */
  readonly title: string;
  /** The meta description, which search results and link previews show. */
  readonly description: string;
}

export interface LiveRoute extends RouteFields {
  readonly status: "live";
  readonly component: PageComponent;
}

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
    status: "coming",
  },
  {
    path: "/identity/",
    label: "Identity",
    title: "Identity",
    description:
      "User accounts, sign-in, sessions, password reset and profiles, as an SDK and as web components that run under a strict policy.",
    status: "coming",
  },
  {
    path: "/tracking/",
    label: "Tracking",
    title: "Tracking",
    description:
      "A privacy-first tracker that sends nothing until the visitor agrees, honours Global Privacy Control and keeps URLs to a path.",
    status: "coming",
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
    status: "coming",
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

export function navigationRoutes(): readonly LiveRoute[] {
  return ROUTES.filter(isLive);
}

/** The routes the home page points to: everything but itself, live or coming. */
export function linkableRoutes(): readonly Route[] {
  return ROUTES.filter((route) => route.path !== "/");
}

export function prerenderedPages(): readonly PrerenderedPage[] {
  const routes = navigationRoutes().map(({ path, component, title, description }) => ({
    file: pageFile(path),
    path,
    component,
    title,
    description,
  }));
  const { file, component, title, description } = NOT_FOUND_PAGE;
  return [...routes, { file, path: undefined, component, title, description }];
}
