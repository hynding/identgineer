import { Component, h, State } from "@stencil/core";
import { REGISTRY, applyVariations, shuffleVariations } from "@identgineer/variations";
import { isOverview, linkableRoutes } from "../../routes";
import { describeLook, lookCount } from "../../shell/appearance";
import { SiteShell, openAppearance } from "../../shell/site-shell";

const AXIS_SHOWCASE = [
  { axis: "theme", name: "Theme", says: "Colour, in a light and a dark scheme" },
  { axis: "design", name: "Design", says: "Surfaces, borders, corners and depth" },
  { axis: "layout", name: "Layout", says: "Where the page's regions go" },
  { axis: "ux", name: "UX mode", says: "Density, type scale, motion and hints" },
] as const;

const ON_THIS_PAGE = [
  { id: "identity", label: "Identity" },
  { id: "tracking", label: "Tracking" },
  { id: "brand-kits", label: "Brand kits" },
  { id: "variations", label: "Variations" },
  { id: "next", label: "Where to next" },
] as const;

const VISITS = "38,41,37,52,49,61,58,66,63,71,69,84";
const CONSENT = "52,55,54,58,61,60,64,66,65,68,70,72";

function formatCount(count: number): string {
  return count.toLocaleString("en-GB");
}

/**
 * The home page: what Identgineer is, shown with its own components. Every colour, space, type size
 * and corner comes from the tokens, so each theme, design, layout and UX mode re-skins it.
 */
@Component({ tag: "site-home" })
export class SiteHome {
  @State() private announcement = "";

  private readonly shuffle = (): void => {
    const next = shuffleVariations();
    const { state } = applyVariations(
      { theme: next.theme, design: next.design, layout: next.layout, ux: next.ux },
      { persist: true },
    );
    this.announcement = describeLook(state);
  };

  private renderShuffle() {
    return (
      <idg-button class="needs-script" variant="secondary" onClick={this.shuffle}>
        <idg-icon slot="start" name="sparkles" />
        Surprise me
      </idg-button>
    );
  }

  private renderHero() {
    return (
      <div slot="hero" class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Identity · Tracking · Brand kits · Variations</p>
          <h1 class="hero-title">Sign-in, analytics and a UI that re-skins itself.</h1>
          <p class="lede">
            Identgineer is a full stack identity and tracking platform: accounts and sessions,
            consent-first analytics and brand kits that become themes, all drawn by web components
            that take on any of {formatCount(lookCount())} looks.
          </p>
          <idg-cluster class="hero-actions" gap="s">
            <idg-button href="#identity">
              See what is inside
              <idg-icon slot="end" name="arrow-down" />
            </idg-button>
            {this.renderShuffle()}
          </idg-cluster>
          <p class="shuffle-status visually-hidden" role="status">
            {this.announcement}
          </p>
        </div>
        <div class="hero-showcase" role="group" aria-label="A few of the components">
          <idg-card class="showcase-profile" variant="raised" padding="sm">
            <div class="profile">
              <idg-avatar name="Ada Lovelace" size="lg" status="online" />
              <div class="profile-text">
                <p class="profile-name">Ada Lovelace</p>
                <p class="profile-detail">Signed in with a passkey</p>
              </div>
              <idg-badge variant="success" size="sm" dot>
                Active
              </idg-badge>
            </div>
          </idg-card>
          <idg-card class="showcase-stat" variant="raised" padding="sm">
            <idg-stat label="Visitors this week" value="12,480" delta="8.2%" direction="up">
              <idg-sparkline slot="chart" values={VISITS} label="Visitors per day" area />
            </idg-stat>
          </idg-card>
          <idg-card class="showcase-palette" variant="raised" padding="sm">
            <p class="palette-title">This theme</p>
            <ul class="palette" aria-label="The colours of the current theme">
              {["accent", "accent-subtle", "success", "warning", "danger", "info"].map((role) => (
                <li class={`swatch swatch-${role}`}>
                  <span class="visually-hidden">{role.replace("-", " ")}</span>
                </li>
              ))}
            </ul>
          </idg-card>
        </div>
      </div>
    );
  }

  private renderIdentity() {
    return (
      <section class="feature feature-identity" id="identity" aria-labelledby="identity-title">
        <div class="feature-head">
          <p class="feature-kicker">
            <idg-icon name="lock" /> Identity
          </p>
          <h2 id="identity-title">Accounts and sign-in that hold up</h2>
        </div>
        <div class="feature-body">
          <p>
            An identity SDK and the forms that use it: sign-in, registration, password reset, the
            profile, a session guard and a user menu. Drop them into any page or framework.
          </p>
          <ul class="checks">
            <li>Sessions refresh themselves, once, across every open tab</li>
            <li>Forms that run under a strict content security policy and Trusted Types</li>
            <li>Clear errors, throttling that says how long to wait, and real labels</li>
          </ul>
        </div>
        <figure class="feature-visual preview">
          <idg-card variant="raised">
            <div class="preview-frame" inert>
              <idg-sign-in />
            </div>
          </idg-card>
          <figcaption>
            The sign-in form, drawn in the current look. This preview is not connected.
          </figcaption>
        </figure>
      </section>
    );
  }

  private renderTracking() {
    return (
      <section class="feature feature-tracking" id="tracking" aria-labelledby="tracking-title">
        <div class="feature-head">
          <p class="feature-kicker">
            <idg-icon name="chart" /> Tracking
          </p>
          <h2 id="tracking-title">Analytics that ask first</h2>
        </div>
        <div class="feature-body">
          <p>
            A consent-first tracker and the dashboard to read it: a property picker, stat figures,
            sparklines and an event table, fed by a source your server controls.
          </p>
          <ul class="checks">
            <li>Nothing is sent or stored until the visitor agrees</li>
            <li>Global Privacy Control and Do Not Track are honoured</li>
            <li>Only the events a page declares, and every URL cut down to its path</li>
          </ul>
        </div>
        <div class="feature-visual figures" role="group" aria-label="Dashboard figures">
          <idg-card variant="outlined" padding="sm">
            <idg-stat label="Page views" value="48,210" delta="12.4%" direction="up">
              <idg-sparkline slot="chart" values={VISITS} label="Page views per day" />
            </idg-stat>
          </idg-card>
          <idg-card variant="outlined" padding="sm">
            <idg-stat label="Consent given" value="72%" delta="3.1%" direction="up">
              <idg-sparkline slot="chart" values={CONSENT} label="Consent rate per day" />
            </idg-stat>
          </idg-card>
          <idg-card class="figures-wide" variant="outlined" padding="sm">
            <idg-progress label="Events within budget" value={64} show-value />
          </idg-card>
        </div>
      </section>
    );
  }

  private renderBrandKits() {
    return (
      <section
        class="feature feature-brand-kits"
        id="brand-kits"
        aria-labelledby="brand-kits-title"
      >
        <div class="feature-head">
          <p class="feature-kicker">
            <idg-icon name="sparkles" /> Brand kits
          </p>
          <h2 id="brand-kits-title">Your brand becomes a theme</h2>
        </div>
        <div class="feature-body">
          <p>
            A brand kit (a name, colours, a font pairing, corners and a tone) is checked, given a
            light and a dark palette that pass the same contrast checks as the built-in themes, and
            applied everywhere at once. Logos are rebuilt by a strict SVG sanitiser before anyone
            sees them. These are the eight themes that ship:
          </p>
        </div>
        <div class="feature-visual themes-room">
          <ul class="themes">
            {REGISTRY.theme.variations.map((theme) => (
              <li class="theme-tile" data-theme={theme.id}>
                <span class="theme-sample" aria-hidden="true">
                  Aa
                  <span class="theme-swatches">
                    <span class="swatch swatch-accent" />
                    <span class="swatch swatch-accent-subtle" />
                    <span class="swatch swatch-text" />
                  </span>
                </span>
                <span class="theme-name">{theme.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  private renderVariations() {
    return (
      <section
        class="feature feature-variations"
        id="variations"
        aria-labelledby="variations-title"
      >
        <div class="feature-head">
          <p class="feature-kicker">
            <idg-icon name="settings" /> Variations
          </p>
          <h2 id="variations-title">Four axes, eight choices each</h2>
        </div>
        <div class="feature-body">
          <p>
            Every page is one set of markup. Four attributes on the root element choose how it looks
            and behaves, any of them mixes with any other, and a visitor's choice is in place before
            the first paint.
          </p>
        </div>
        <div class="feature-visual">
          <div class="axes">
            {AXIS_SHOWCASE.map(({ axis, name, says }) => (
              <idg-card heading={name} heading-level={3} variant="plain">
                <p class="axis-says">{says}</p>
                <ul class="axis-values">
                  {REGISTRY[axis].variations.map((variation) => (
                    <li>{variation.label}</li>
                  ))}
                </ul>
              </idg-card>
            ))}
          </div>
          <div class="combinations">
            <p class="combinations-figure">
              <span class="figure">{formatCount(lookCount())}</span>
              <span class="figure-label">looks from one page, without a line of it changing</span>
            </p>
            <idg-cluster gap="s" class="needs-script">
              <idg-button onClick={openAppearance}>
                <idg-icon slot="start" name="settings" />
                Open the appearance panel
              </idg-button>
              {this.renderShuffle()}
            </idg-cluster>
          </div>
        </div>
      </section>
    );
  }

  /** What the features page will cover: the sections of this page, but the pages to come. */
  private renderTopics() {
    return (
      <ul class="next-topics">
        {ON_THIS_PAGE.filter(({ id }) => id !== "next").map(({ label }) => (
          <li>
            <idg-icon name="check" />
            {label}
          </li>
        ))}
      </ul>
    );
  }

  private renderNext() {
    return (
      <section class="feature feature-next" id="next" aria-labelledby="next-title">
        <div class="feature-head">
          <p class="feature-kicker">
            <idg-icon name="arrow-right" /> Next
          </p>
          <h2 id="next-title">Where to next</h2>
        </div>
        <div class="feature-body">
          <p>The pages still to come, each made from the same components and tokens as this one.</p>
        </div>
        <div class="feature-visual next">
          <div class="next-cards">
            {linkableRoutes().map((route) => {
              const overview = isOverview(route);
              return route.status === "live" ? (
                <idg-card
                  class={{ "next-overview": overview }}
                  heading={route.label}
                  href={route.path}
                  variant="raised"
                >
                  {route.description}
                  {overview ? this.renderTopics() : null}
                </idg-card>
              ) : (
                <idg-card
                  class={{ "next-overview": overview }}
                  heading={route.label}
                  variant="outlined"
                >
                  <idg-badge slot="header" variant="info" size="sm">
                    Coming soon
                  </idg-badge>
                  {route.description}
                  {overview ? this.renderTopics() : null}
                </idg-card>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  render() {
    return (
      <SiteShell current="/">
        {this.renderHero()}
        <div class="home">
          <div class="sections">
            {this.renderIdentity()}
            {this.renderTracking()}
            {this.renderBrandKits()}
            {this.renderVariations()}
            {this.renderNext()}
          </div>
        </div>
        <nav slot="aside" class="on-this-page" aria-labelledby="on-this-page-title">
          <h2 id="on-this-page-title">On this page</h2>
          <ul>
            {ON_THIS_PAGE.map(({ id, label }) => (
              <li>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </SiteShell>
    );
  }
}
