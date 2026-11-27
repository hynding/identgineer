import { Component, h } from "@stencil/core";
import { navigationRoutes } from "../../routes";
import { SiteShell } from "../../shell/site-shell";

/**
 * The page a server sends for an address the site does not have. It is served at that address, so
 * every link on it is root-relative and nothing in the navigation is marked as current.
 */
@Component({ tag: "site-not-found" })
export class SiteNotFound {
  render() {
    return (
      <SiteShell current={undefined}>
        <section class="not-found" aria-labelledby="not-found-title">
          <p class="not-found-code" aria-hidden="true">
            404
          </p>
          <h1 id="not-found-title">Page not found</h1>
          <p class="lede">
            There is no page at this address. It may have moved, or it may be one of the pages still
            to come.
          </p>
          <idg-cluster gap="s">
            <idg-button href="/">
              <idg-icon slot="start" name="home" />
              Go to the home page
            </idg-button>
          </idg-cluster>
          <h2>Pages on this site</h2>
          <ul class="page-list">
            {navigationRoutes().map((route) => (
              <li>
                <a href={route.path}>{route.label}</a>
                <span class="page-list-description">{route.description}</span>
              </li>
            ))}
          </ul>
        </section>
      </SiteShell>
    );
  }
}
