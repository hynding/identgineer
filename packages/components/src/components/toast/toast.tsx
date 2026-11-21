import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Method,
  Prop,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { Countdown } from "../../utils/countdown";
import {
  DEFAULT_TOAST_DURATION_MS,
  TOAST_ICONS,
  TOAST_VARIANTS,
  type ToastDismissDetail,
  type ToastDismissReason,
  type ToastVariant,
} from "./toast-options";

/** The shortest sideways drag that dismisses a toast, however narrow it is. */
const SWIPE_MIN_PX = 64;

/** The share of its width a toast must be dragged to be dismissed, when that is further. */
const SWIPE_SHARE = 0.35;

interface Swipe {
  /** The press that started it, which the document's press listener must not take for another. */
  press: PointerEvent;
  pointerId: number;
  startX: number;
  distance: number;
}

/**
 * A short notification that comes and goes. Put it in an idg-toast-region, which shows a few at a
 * time, announces each as it appears, pauses them while they are being read and lets the keyboard
 * reach them; the `toast()` function does all of that from script.
 *
 * It goes away after its duration, or by its close button, Escape from inside it, a sideways swipe,
 * its action, or `dismiss()`. A toast that offers an action stays until it is dismissed unless it
 * is given a duration, so nobody loses the chance to act on it.
 *
 * @part toast - The surface.
 * @part icon - The variant's icon.
 * @part heading - The heading.
 * @part description - The description.
 * @part action - The action button.
 * @part close - The close button.
 */
@Component({
  tag: "idg-toast",
  styleUrls: ["../../styles/tone.css", "../../styles/focus-ring.css", "toast.css"],
  shadow: true,
})
export class IdgToast {
  @Element() host!: HTMLElement;

  /** The heading, and the toast's accessible name. Set as text, never as markup. */
  @Prop() heading?: string;

  /** More detail under the heading. Set as text, never as markup. */
  @Prop() description?: string;

  /** Meaning. A danger toast is announced at once; the others wait for a pause in speech. */
  @Prop({ reflect: true }) variant: ToastVariant = "neutral";

  /**
   * How long the toast stays, in milliseconds. `0` keeps it until it is dismissed. Without a
   * duration it stays for six seconds, or until dismissed when it has an action.
   */
  @Prop() duration?: number;

  /** The label of an action button, such as "Undo". Choosing it fires `idgAction`. */
  @Prop({ attribute: "action-label" }) actionLabel?: string;

  /** The close button's accessible name. */
  @Prop({ attribute: "close-label" }) closeLabel = "Dismiss";

  /** Set by the region while the toast waits its turn: it is hidden and does not count down. */
  @Prop({ reflect: true }) queued = false;

  /** Set by the region while the toasts are being read: the countdown stands still. */
  @Prop() paused = false;

  /** Fires when the action button is chosen, just before the toast is dismissed. */
  @Event() idgAction!: EventEmitter<void>;

  /**
   * Fires when the toast is dismissed, with the reason. The toast then removes itself, unless a
   * listener calls `preventDefault()`.
   */
  @Event({ cancelable: true }) idgDismiss!: EventEmitter<ToastDismissDetail>;

  private readonly countdown = new Countdown(() => {
    this.finish("timeout");
  });

  private surface?: HTMLElement;
  private swipe: Swipe | undefined;
  private dismissed = false;

  connectedCallback(): void {
    this.queuedChanged();
    this.pausedChanged();
    this.restart();
  }

  disconnectedCallback(): void {
    this.countdown.stop();
    this.resetSwipe();
  }

  componentDidLoad(): void {
    const surface = this.surface;
    if (!surface) return;
    surface.addEventListener("pointerdown", this.handlePointerDown);
    surface.addEventListener("pointermove", this.handlePointerMove);
  }

  /** Dismisses the toast, as if its close button had been chosen but with the reason `api`. */
  @Method()
  async dismiss(): Promise<void> {
    this.finish("api");
    return Promise.resolve();
  }

  @Watch("queued")
  queuedChanged(): void {
    if (this.queued) this.countdown.hold("queued");
    else this.countdown.release("queued");
  }

  @Watch("paused")
  pausedChanged(): void {
    if (this.paused) this.countdown.hold("paused");
    else this.countdown.release("paused");
  }

  @Watch("duration")
  @Watch("actionLabel")
  restart(): void {
    this.countdown.start(this.lifetime());
  }

  @Listen("keydown")
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.finish("escape");
  }

  private lifetime(): number | undefined {
    const duration = this.duration;
    if (duration === undefined) {
      return this.hasAction() ? undefined : DEFAULT_TOAST_DURATION_MS;
    }
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  }

  private hasAction(): boolean {
    return this.actionLabel !== undefined && this.actionLabel !== "";
  }

  private finish(reason: ToastDismissReason): void {
    if (this.dismissed || !this.host.isConnected) return;
    const event = this.idgDismiss.emit({ reason });
    if (event.defaultPrevented) {
      this.resetSwipe();
      return;
    }
    this.countdown.stop();
    this.dismissed = true;
    // Removed once the event that dismissed it has finished its way through the page.
    queueMicrotask(() => {
      this.host.remove();
    });
  }

  private choose = (): void => {
    this.idgAction.emit();
    this.finish("action");
  };

  private close = (): void => {
    this.finish("close-button");
  };

  private handlePointerDown = (event: PointerEvent): void => {
    this.resetSwipe();
    if (!event.isPrimary || event.button !== 0) return;
    this.swipe = { press: event, pointerId: event.pointerId, startX: event.clientX, distance: 0 };
    // The release is heard on the document, in the capture phase: a quick flick can end off the
    // toast before any move, and so before the pointer is captured, has been reported. A release
    // can still be lost, to a handler that stops it first or to a context menu, so the next press
    // anywhere, a context menu or the window losing focus ends the swipe, rather than leaving it
    // for an unrelated release to finish.
    document.addEventListener("pointerup", this.handlePointerUp, true);
    document.addEventListener("pointercancel", this.resetSwipe, true);
    document.addEventListener("pointerdown", this.handleOtherPress, true);
    document.addEventListener("contextmenu", this.resetSwipe, true);
    window.addEventListener("blur", this.resetSwipe);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const swipe = this.swipe;
    if (swipe?.pointerId !== event.pointerId) return;
    swipe.distance = event.clientX - swipe.startX;
    if (Math.abs(swipe.distance) < 4) return;
    const surface = this.surface;
    if (!surface) return;
    // Captured only once it is a drag, so a plain click still reaches the button it is on.
    if ("setPointerCapture" in surface && !surface.hasPointerCapture(event.pointerId)) {
      surface.setPointerCapture(event.pointerId);
    }
    surface.style.setProperty("--_swipe", `${String(swipe.distance)}px`);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const swipe = this.swipe;
    if (swipe?.pointerId !== event.pointerId) return;
    swipe.distance = event.clientX - swipe.startX;
    const width = this.surface?.getBoundingClientRect().width ?? 0;
    if (Math.abs(swipe.distance) >= Math.max(SWIPE_MIN_PX, width * SWIPE_SHARE)) {
      this.finish("swipe");
    } else {
      this.resetSwipe();
    }
  };

  private handleOtherPress = (event: PointerEvent): void => {
    if (event !== this.swipe?.press) this.resetSwipe();
  };

  private resetSwipe = (): void => {
    document.removeEventListener("pointerup", this.handlePointerUp, true);
    document.removeEventListener("pointercancel", this.resetSwipe, true);
    document.removeEventListener("pointerdown", this.handleOtherPress, true);
    document.removeEventListener("contextmenu", this.resetSwipe, true);
    window.removeEventListener("blur", this.resetSwipe);
    this.swipe = undefined;
    this.surface?.style.removeProperty("--_swipe");
  };

  render() {
    const variant = oneOf(TOAST_VARIANTS, this.variant, "neutral");
    const icon = TOAST_ICONS[variant];
    const description = this.description ?? "";
    return (
      <div
        ref={(element) => (this.surface = element)}
        class={{ toast: true, [`variant-${variant}`]: true }}
        part="toast"
        role="group"
        aria-labelledby="heading"
      >
        {icon === undefined ? null : (
          <idg-icon class="icon" part="icon" name={icon} size="lg" aria-hidden="true" />
        )}
        <div class="content">
          <p class="heading" id="heading" part="heading">
            {this.heading ?? ""}
          </p>
          {description === "" ? null : (
            <p class="description" part="description">
              {description}
            </p>
          )}
        </div>
        {this.hasAction() ? (
          <button class="action focusable" part="action" type="button" onClick={this.choose}>
            {this.actionLabel}
          </button>
        ) : null}
        <button
          class="close focusable"
          part="close"
          type="button"
          aria-label={this.closeLabel}
          onClick={this.close}
        >
          <idg-icon name="close" />
        </button>
      </div>
    );
  }
}
