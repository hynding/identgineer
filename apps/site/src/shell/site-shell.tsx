import { Build, h, type FunctionalComponent } from "@stencil/core";
// Brings the component library's collection into this build, so Stencil compiles, prerenders and
// hydrates its components together with the site's own.
import "@identgineer/components";
import { ROUTES, navigationRoutes, type RoutePath } from "../routes";
import { BrandMark } from "./brand-mark";

const APPEARANCE_DIALOG = "appearance";

interface SiteShellProps {
  /** The path of the page being drawn, which the navigation marks; none on the 404 page. */
  readonly current: RoutePath | undefined;
}

export function openAppearance(): void {
  const dialog = document.getElementById(APPEARANCE_DIALOG) as HTMLIdgDialogElement | null;
  void dialog?.showModal();
}

/**
 * The current page is marked as the page; the page a section's page sits under (the docs index for
 * a guide) is marked as the current one of its set.
 */
function currentness(path: RoutePath, current: RoutePath | undefined): "page" | "true" | undefined {
  if (path === current) return "page";
  const parent = ROUTES.find((route) => route.path === current)?.parent;
  return path === parent ? "true" : undefined;
}

function PageLinks({ current }: SiteShellProps, slot?: string) {
  return navigationRoutes().map((route) => (
    <a slot={slot} href={route.path} aria-current={currentness(route.path, current)}>
      {route.label}
    </a>
  ));
}

/**
 * The frame of every page: the skip link and landmarks of `idg-layout`, the site's name, the
 * navigation, the appearance panel and the footer. The page's own content is its children, which
 * may fill the shell's `hero` and `aside` slots as well as the main content.
 *
 * The appearance button and its dialog are the only parts that need a script. The dialog is drawn
 * in the browser only: it is closed until asked for, so prerendering it would only add weight, and
 * it would show the default choices until the switcher had read the visitor's.
 */
export const SiteShell: FunctionalComponent<SiteShellProps> = ({ current }, children) => [
  <idg-layout class="site-layout">
    <a slot="brand" class="brand" href="/">
      <BrandMark />
      <span class="brand-name">Identgineer</span>
    </a>
    {PageLinks({ current }, "navigation")}
    <idg-button
      slot="actions"
      class="needs-script"
      variant="secondary"
      size="sm"
      onClick={openAppearance}
    >
      <idg-icon slot="start" name="settings" />
      Appearance
    </idg-button>
    {children}
    <div slot="footer" class="site-footer">
      <div class="site-footer-brand">
        <BrandMark />
        <p>
          <strong>Identgineer</strong> Identity, tracking and a UI that re-skins itself.
        </p>
      </div>
      <nav class="site-footer-pages" aria-label="Site pages">
        <ul>
          {PageLinks({ current }).map((link) => (
            <li>{link}</li>
          ))}
        </ul>
      </nav>
      <p class="script-note">
        The appearance panel needs JavaScript. Every page reads and works without it.
      </p>
      <p class="colophon">
        Built from its own components and tokens, with no request to any other site. MIT licence.
      </p>
    </div>
  </idg-layout>,
  Build.isBrowser ? (
    <idg-dialog id={APPEARANCE_DIALOG} heading="Appearance" size="lg">
      <idg-variation-switcher persist />
    </idg-dialog>
  ) : null,
];
