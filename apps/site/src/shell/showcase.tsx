import { h } from "@stencil/core";
import { REGISTRY } from "@identgineer/variations";

const VISITS = "38,41,37,52,49,61,58,66,63,71,69,84";
const CONSENT = "52,55,54,58,61,60,64,66,65,68,70,72";

/**
 * The demos the home page and the reading pages share, each drawn from the project's own
 * components with sample data and connected to nothing.
 */

/** The sign-in form, inert: it can be looked at and read, not filled in or sent. */
export function SignInPreview() {
  return (
    <idg-card variant="raised">
      <div class="preview-frame" inert>
        <idg-sign-in />
      </div>
    </idg-card>
  );
}

/** Two stat figures with sparklines and a progress bar, as a dashboard draws them. */
export function DashboardFigures({ class: className }: { readonly class?: string }) {
  return (
    <div
      class={`figures${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Dashboard figures"
    >
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
  );
}

/** Every built-in theme on a tile of its own, in its own colours and type. */
export function ThemeTiles() {
  return (
    <ul class="themes">
      {REGISTRY.theme.variations.map((theme) => (
        <li class="theme-tile" data-theme={theme.id}>
          <span class="theme-sample" aria-hidden="true">
            <span class="theme-letters">Aa</span>
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
  );
}

/** The visitors figure of the home page's hero. */
export const VISITS_PER_DAY = VISITS;
