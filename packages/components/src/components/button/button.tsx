import { AttachInternals, Component, h, Prop, type FunctionalComponent } from "@stencil/core";
import { linkRel, oneOf, safeUrl } from "../../utils/controls-copies";
import {
  BUTTON_SIZES,
  BUTTON_TYPES,
  BUTTON_VARIANTS,
  type ButtonSize,
  type ButtonType,
  type ButtonVariant,
} from "./button-options";

/**
 * @slot - The label.
 * @slot start - Content before the label, such as an icon. Replaced by the spinner while loading.
 * @slot end - Content after the label.
 * @part control - The native button or link.
 * @part label - The wrapper around the default slot.
 * @part spinner - The loading indicator.
 */
@Component({
  tag: "idg-button",
  styleUrls: ["../../styles/control.css", "../../styles/visually-hidden.css", "button.css"],
  shadow: true,
  formAssociated: true,
})
export class IdgButton {
  @AttachInternals() internals!: ElementInternals;

  /** Visual emphasis. */
  @Prop({ reflect: true }) variant: ButtonVariant = "primary";

  /** Control size. Never smaller than the design's minimum target size. */
  @Prop({ reflect: true }) size: ButtonSize = "md";

  /** What activating the button does inside a form. Ignored when `href` is set. */
  @Prop() type: ButtonType = "button";

  /** Blocks activation and takes the control out of the tab order. */
  @Prop({ reflect: true }) disabled = false;

  /** Shows a spinner and blocks activation, but keeps the control focusable. */
  @Prop({ reflect: true }) loading = false;

  /** Renders a link. Only http, https, mailto, tel and relative urls are kept. */
  @Prop() href?: string;

  /** Where a link opens. Anything but `_self` adds `rel="noopener noreferrer"`. */
  @Prop() target?: string;

  /** Link relationship. */
  @Prop() rel?: string;

  /** Stretches the button to its container. */
  @Prop({ attribute: "full-width", reflect: true }) fullWidth = false;

  /** A hint such as `Enter`, shown only when the UX mode turns shortcuts on. */
  @Prop() shortcut?: string;

  /** Set by an overlay this button opens: whether it is open (`aria-expanded`). */
  @Prop() accessibleExpanded?: boolean;

  /** Set by an overlay this button opens: what kind of popup it is (`aria-haspopup`). */
  @Prop() accessibleHaspopup?: string;

  /** Set by an overlay this button opens: the element it opens (`aria-controls`). */
  @Prop() accessibleControls?: Element[];

  /** Set by idg-tooltip: the hint, as the control's accessible description. */
  @Prop() accessibleDescription?: string;

  private native?: HTMLElement;

  // An element reference cannot be an attribute, so the controls relation is set as a property.
  // Pointing out of this root to the overlay's host is allowed by element reflection.
  componentDidRender(): void {
    const native = this.native as
      (HTMLElement & { ariaControlsElements?: Element[] | null }) | undefined;
    if (native && "ariaControlsElements" in native) {
      native.ariaControlsElements = this.accessibleControls ?? null;
    }
  }

  // Handled on the inner control, which every pointer and keyboard activation passes through,
  // so a blocked click never reaches the consumer's listeners on the host.
  private handleClick = (event: MouseEvent): void => {
    if (this.isBlocked()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!this.isLink()) this.activateForm();
  };

  private isBlocked(): boolean {
    return this.disabled || this.loading;
  }

  private isLink(): boolean {
    return Boolean(this.href);
  }

  // A button inside a shadow root is not associated with the outer form, so the host does it.
  private activateForm(): void {
    const form = this.internals.form;
    const type = oneOf(BUTTON_TYPES, this.type, "button");
    if (type === "submit") form?.requestSubmit();
    else if (type === "reset") form?.reset();
  }

  render() {
    const variant = oneOf(BUTTON_VARIANTS, this.variant, "primary");
    const size = oneOf(BUTTON_SIZES, this.size, "md");
    const shared = {
      class: { control: true, [`variant-${variant}`]: true, [`size-${size}`]: true },
      part: "control",
      onClick: this.handleClick,
      "aria-busy": this.loading ? "true" : undefined,
      "aria-keyshortcuts": this.shortcut === "" ? undefined : this.shortcut,
      "aria-expanded":
        this.accessibleExpanded === undefined ? undefined : String(this.accessibleExpanded),
      "aria-haspopup": this.accessibleHaspopup === "" ? undefined : this.accessibleHaspopup,
      "aria-describedby": this.accessibleDescription ? "description" : undefined,
      ref: (element?: HTMLElement) => (this.native = element),
    };

    const content = <Content loading={this.loading} shortcut={this.shortcut} />;
    // Outside the control, so the description is not read as part of the button's name.
    const description = this.accessibleDescription ? (
      <span id="description" class="visually-hidden">
        {this.accessibleDescription}
      </span>
    ) : null;

    if (this.isLink()) {
      // Without an href an anchor is neither focusable nor a link, so it is given the role back
      // and marked unavailable, which is also how a disabled or unsafe link is shown.
      const href = this.isBlocked() ? undefined : safeUrl(this.href);
      const unavailable = href === undefined;
      return [
        <a
          {...shared}
          href={href}
          role={unavailable ? "link" : undefined}
          aria-disabled={unavailable ? "true" : undefined}
          target={unavailable ? undefined : this.target}
          rel={unavailable ? undefined : linkRel(this.target, this.rel)}
        >
          {content}
        </a>,
        description,
      ];
    }

    return [
      <button
        {...shared}
        type={oneOf(BUTTON_TYPES, this.type, "button")}
        disabled={this.disabled}
        aria-disabled={this.loading && !this.disabled ? "true" : undefined}
      >
        {content}
      </button>,
      description,
    ];
  }
}

interface ContentProps {
  loading: boolean;
  shortcut: string | undefined;
}

const Content: FunctionalComponent<ContentProps> = ({ loading, shortcut }) => [
  loading ? <span class="spinner" part="spinner" aria-hidden="true" /> : <slot name="start" />,
  <span class="label" part="label">
    <slot />
  </span>,
  <slot name="end" />,
  shortcut ? (
    <kbd class="shortcut" aria-hidden="true">
      {shortcut}
    </kbd>
  ) : null,
];
