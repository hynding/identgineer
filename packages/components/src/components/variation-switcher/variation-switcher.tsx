import { Component, Element, Event, h, Prop, State, type EventEmitter } from "@stencil/core";
import {
  applyVariations,
  getVariations,
  onVariationsChange,
  resetVariations,
  REGISTRY,
  shuffleVariations,
  variationsUrl,
  type VariationAxis,
} from "@identgineer/variations";
import { oneOf } from "../../utils/choice";
import type { ValueDetail } from "../../utils/event-details";
import { ThemeSwatch } from "./theme-swatch";
import {
  CONTROL_LABELS,
  describeChange,
  ORIENTATIONS,
  parseControls,
  SCHEME_OPTIONS,
  type ControlName,
  type SwitcherOrientation,
} from "./variation-switcher-options";
import type { StateKey, VariationState, VariationsChangeDetail } from "./variation-switcher-types";

const DEFAULT_NAME = "Appearance";
const SHUFFLED_AXES: readonly VariationAxis[] = ["theme", "design", "layout", "ux"];
const COPIED = "Link copied.";
const NOT_COPIED = "The link could not be copied. Select it below and copy it yourself.";

interface Result {
  readonly state: VariationState;
  readonly changed: readonly StateKey[];
}

// Optional because the element may not be defined yet when the panel is drawn.
interface Focusable {
  setFocus?: () => Promise<void>;
  selectText?: () => Promise<void>;
}

/**
 * A panel that lets a visitor change the four variation axes and the colour scheme of the page. It
 * always acts on the document's root element, through `@identgineer/variations`, so the page's own
 * attributes stay the single truth: a change made anywhere else (markup, a script, another
 * switcher) is shown here, and nothing here is announced for a change the visitor did not make.
 *
 * @part panel - The box that holds everything.
 * @part heading - The visible heading, when `heading` is set.
 * @part controls - The area that holds the five controls.
 * @part actions - The row of buttons.
 * @part status - The message that follows an action.
 */
@Component({
  tag: "idg-variation-switcher",
  styleUrls: ["../../styles/visually-hidden.css", "variation-switcher.css"],
  shadow: true,
})
export class IdgVariationSwitcher {
  @Element() host!: HTMLElement;

  /**
   * Saves each change with the runtime's persistence, so the choice is still there on the next
   * visit. The bootstrap script of `@identgineer/variations` applies it before the page is painted.
   */
  @Prop({ reflect: true }) persist = false;

  /**
   * The controls to show, as a comma separated list of `theme`, `design`, `layout`, `ux` and
   * `scheme`. Unknown names are ignored, and without a known name every control is shown.
   */
  @Prop() axes?: string;

  /** `stacked` puts the controls in a column, `inline` side by side where there is room. */
  @Prop({ reflect: true }) orientation: SwitcherOrientation = "stacked";

  /** A visible heading, which also names the panel. Without one the name is "Appearance". */
  @Prop() heading?: string;

  /** Fires when the visitor changes something through the panel, with the new state. */
  @Event() idgVariationsChange!: EventEmitter<VariationsChangeDetail>;

  @State() private state?: VariationState;
  @State() private message = "";
  // The message is written into one of two nodes, alternately. A live region announces what is
  // added, so the same words said twice would be silent the second time if they stayed in one node.
  @State() private slot: 0 | 1 = 0;
  @State() private messageShown = false;
  @State() private fallbackUrl?: string;

  private stopListening?: () => void;
  private fallbackInput?: Focusable;
  private focusFallback = false;

  connectedCallback(): void {
    this.state = getVariations();
    // The page is the truth: whoever changes it, this panel shows it. A change made here comes
    // back through the same listener, which is harmless because it only stores the state.
    this.stopListening = onVariationsChange(({ state }) => {
      this.state = state;
      // A link made before this change no longer says what the page is.
      if (this.fallbackUrl !== undefined) {
        this.fallbackUrl = undefined;
        this.say("", false);
      }
    });
  }

  disconnectedCallback(): void {
    this.stopListening?.();
    this.stopListening = undefined;
  }

  componentDidRender(): void {
    if (!this.focusFallback) return;
    this.focusFallback = false;
    void this.fallbackInput?.setFocus?.();
    void this.fallbackInput?.selectText?.();
  }

  private finish(result: Result, message: string): void {
    this.state = result.state;
    // The manual link stays when nothing changed: it is still accurate, and its message still shown.
    if (result.changed.length === 0) return;
    // A real change usually clears it through the variations listener, but not when the change
    // undoes an outside one the listener has not heard of yet, so it is cleared here as well.
    this.fallbackUrl = undefined;
    this.say(message, false);
    this.idgVariationsChange.emit({ state: result.state, changed: result.changed });
  }

  private say(message: string, shown: boolean): void {
    this.message = message;
    this.messageShown = shown;
    this.slot = this.slot === 0 ? 1 : 0;
  }

  private choose(control: ControlName, value: string): void {
    const result = applyVariations({ [control]: value }, { persist: this.persist });
    this.finish(result, describeChange(control, result.state));
  }

  private handleChoice = (control: ControlName) => (event: CustomEvent<ValueDetail>) => {
    // The inner control's own event is an implementation detail of this panel.
    event.stopPropagation();
    this.choose(control, event.detail.value);
  };

  private shuffle = (): void => {
    const next = shuffleVariations();
    // The scheme is left out, so a shuffle neither changes nor stores it.
    const result = applyVariations(
      { theme: next.theme, design: next.design, layout: next.layout, ux: next.ux },
      { persist: this.persist },
    );
    this.finish(result, `Shuffled. ${describeChange(SHUFFLED_AXES, result.state)}`);
  };

  private reset = (): void => {
    const result = resetVariations({ persist: this.persist });
    this.finish(result, "Reset to the defaults.");
  };

  private copyLink = async (): Promise<void> => {
    const link = variationsUrl(getVariations(), location.href);
    try {
      const clipboard = navigator.clipboard as Clipboard | undefined;
      if (typeof clipboard?.writeText !== "function") throw new Error("No clipboard");
      await clipboard.writeText(link);
      this.fallbackUrl = undefined;
      this.say(COPIED, true);
    } catch {
      // Denied, blocked by the permissions policy, or an insecure page: the link is shown to be
      // copied by hand. document.execCommand is deliberately not used as a fallback.
      this.fallbackUrl = link;
      this.focusFallback = true;
      this.say(NOT_COPIED, true);
    }
  };

  private hint(control: Exclude<ControlName, "scheme">, state: VariationState): string {
    return (
      REGISTRY[control].variations.find((variation) => variation.id === state[control])
        ?.description ?? ""
    );
  }

  private renderControl(control: ControlName, state: VariationState) {
    const common = { "data-control": control, label: CONTROL_LABELS[control], class: "control" };
    if (control === "theme") {
      return (
        <idg-field {...common} hint={this.hint(control, state)}>
          <idg-radio-group
            value={state.theme}
            orientation="horizontal"
            onIdgChange={this.handleChoice("theme")}
          >
            {REGISTRY.theme.variations.map((theme) => (
              <idg-radio value={theme.id}>
                <span class="theme-option">
                  <ThemeSwatch swatches={theme.preview.swatches} />
                  {theme.label}
                </span>
              </idg-radio>
            ))}
          </idg-radio-group>
        </idg-field>
      );
    }
    if (control === "scheme") {
      return (
        <idg-field {...common}>
          <idg-radio-group
            value={state.scheme}
            orientation="horizontal"
            onIdgChange={this.handleChoice("scheme")}
          >
            {SCHEME_OPTIONS.map((option) => (
              <idg-radio value={option.id}>{option.label}</idg-radio>
            ))}
          </idg-radio-group>
        </idg-field>
      );
    }
    return (
      <idg-field {...common} hint={this.hint(control, state)}>
        <idg-select value={state[control]} onIdgChange={this.handleChoice(control)}>
          {REGISTRY[control].variations.map((variation) => (
            <option value={variation.id}>{variation.label}</option>
          ))}
        </idg-select>
      </idg-field>
    );
  }

  render() {
    const state = this.state ?? getVariations();
    const orientation = oneOf(ORIENTATIONS, this.orientation, "stacked");
    const heading = this.heading?.trim() ?? "";
    return (
      <div
        class={{ panel: true, [`orientation-${orientation}`]: true }}
        part="panel"
        role="group"
        aria-label={heading === "" ? DEFAULT_NAME : undefined}
        aria-labelledby={heading === "" ? undefined : "heading"}
      >
        {heading === "" ? null : (
          <p class="heading" id="heading" part="heading">
            {heading}
          </p>
        )}
        <div class="controls" part="controls">
          {parseControls(this.axes).map((control) => this.renderControl(control, state))}
        </div>
        <div class="actions" part="actions">
          <idg-button variant="secondary" size="sm" data-action="shuffle" onClick={this.shuffle}>
            <idg-icon slot="start" name="sparkles" />
            Surprise me
          </idg-button>
          <idg-button variant="secondary" size="sm" data-action="reset" onClick={this.reset}>
            Reset
          </idg-button>
          <idg-button
            variant="secondary"
            size="sm"
            data-action="copy"
            onClick={() => {
              void this.copyLink();
            }}
          >
            <idg-icon slot="start" name="copy" />
            Copy link
          </idg-button>
        </div>
        {this.fallbackUrl === undefined ? null : (
          <div class="fallback">
            <idg-input
              readonly
              value={this.fallbackUrl}
              accessibleLabel="Share link"
              ref={(element) => (this.fallbackInput = element)}
            />
          </div>
        )}
        <p
          class={{ status: true, "visually-hidden": !this.messageShown }}
          part="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span data-slot="0">{this.slot === 0 ? this.message : ""}</span>
          <span data-slot="1">{this.slot === 1 ? this.message : ""}</span>
        </p>
      </div>
    );
  }
}
