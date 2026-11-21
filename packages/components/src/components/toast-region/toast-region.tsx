import { Component, Element, h, Listen, Prop, Watch } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { deepActiveElement, firstFocusable, isWithin } from "../../utils/focus";
import { ToastQueue } from "../../utils/toast-queue";
import { TOAST_POSITIONS, type ToastPosition } from "./toast-region-options";

/** A live region only speaks about a change it saw, so text is set once it has been rendered. */
const ANNOUNCE_DELAY_MS = 100;

/** The announcement is cleared afterwards, so browsing the page does not meet each toast twice. */
const ANNOUNCEMENT_LIFETIME_MS = 5000;

interface RegionToast extends HTMLElement {
  heading?: string;
  description?: string;
  variant?: string;
  queued: boolean;
  paused: boolean;
}

type PauseReason = "hover" | "focus" | "background" | "motion";

function isToast(element: Element): element is RegionToast {
  return element.localName === "idg-toast";
}

/** Puts each line in a paragraph of its own, as text, so a screen reader pauses between them. */
function say(announcer: HTMLElement, lines: readonly string[]): void {
  announcer.textContent = "";
  for (const line of lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    announcer.append(paragraph);
  }
}

/**
 * The corner where toasts appear: a landmark, reached from anywhere with F8, in the top layer as a
 * manual popover so it stays above other overlays. It shows a few toasts at a time and queues the
 * rest, and announces each toast as it comes into view through a live region of its own: politely,
 * or at once for danger. Focus never moves on its own.
 *
 * While the pointer is over it, focus is inside it, the window is in the background or the user
 * prefers reduced motion, every toast stands still, so nothing disappears while it is being read
 * and nothing slides under the pointer.
 *
 * @slot - The idg-toast elements.
 * @part region - The landmark holding the toasts.
 */
@Component({
  tag: "idg-toast-region",
  styleUrls: ["../../styles/visually-hidden.css", "toast-region.css"],
  shadow: true,
})
export class IdgToastRegion {
  @Element() host!: HTMLElement;

  /** The corner or edge the toasts gather at. */
  @Prop({ reflect: true }) position: ToastPosition = "bottom-end";

  /** How many toasts show at once. The rest wait their turn. */
  @Prop() max = 3;

  /** The landmark's accessible name. */
  @Prop() label = "Notifications";

  /** The key, as `KeyboardEvent.key` names it, that moves focus to the toasts. */
  @Prop() hotkey = "F8";

  private region?: HTMLElement;
  private polite?: HTMLElement;
  private assertive?: HTMLElement;
  private readonly queue = new ToastQueue<RegionToast>();
  private readonly pauses = new Set<PauseReason>();
  private visible: RegionToast[] = [];
  private shown = false;
  private returnFocus: Element | undefined;
  private motion?: MediaQueryList;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  componentDidLoad(): void {
    this.region?.addEventListener("pointerenter", this.handlePointerEnter);
    this.region?.addEventListener("pointerleave", this.handlePointerLeave);
    if (typeof window.matchMedia === "function") {
      this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.motion.addEventListener("change", this.motionChanged);
      this.motionChanged();
    }
    this.sync();
  }

  disconnectedCallback(): void {
    this.motion?.removeEventListener("change", this.motionChanged);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  @Watch("max")
  maxChanged(): void {
    this.sync();
  }

  @Listen("focusin")
  handleFocusIn(): void {
    this.setPause("focus", true);
  }

  @Listen("focusout")
  handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    this.setPause("focus", next !== null && isWithin(next, this.host));
  }

  @Listen("blur", { target: "window" })
  handleWindowBlur(): void {
    this.setPause("background", true);
  }

  @Listen("focus", { target: "window" })
  handleWindowFocus(): void {
    this.setPause("background", false);
  }

  @Listen("keydown", { target: "document" })
  handleHotkey(event: KeyboardEvent): void {
    if (event.key !== this.hotkey || this.visible.length === 0 || !this.region) return;
    event.preventDefault();
    const active = deepActiveElement();
    if (active && !isWithin(active, this.host)) this.returnFocus = active;
    this.region.focus();
  }

  @Listen("keydown")
  handleKeyDown(event: KeyboardEvent): void {
    // A toast handles Escape from inside itself; this is Escape on the landmark itself.
    if (event.key !== "Escape" || event.composedPath()[0] !== this.region) return;
    event.preventDefault();
    this.leave();
  }

  @Listen("idgDismiss")
  handleDismiss(event: CustomEvent<unknown>): void {
    const toast = event.target as Element;
    if (event.defaultPrevented || !isToast(toast)) return;
    if (!isWithin(deepActiveElement(), toast)) return;
    // Focus would be lost with the toast, so it moves to a neighbour, or back where it came from.
    const index = this.visible.indexOf(toast);
    const neighbour = this.visible[index + 1] ?? this.visible[index - 1];
    const target = neighbour && neighbour !== toast ? firstFocusable(neighbour) : undefined;
    if (target) target.focus();
    else this.leave();
  }

  private leave(): void {
    const target = this.returnFocus as HTMLElement | undefined;
    this.returnFocus = undefined;
    if (target?.isConnected && typeof target.focus === "function") target.focus();
  }

  private sync = (): void => {
    const toasts = Array.from(this.host.children).filter(isToast);
    const { visible, queued, added } = this.queue.sync(toasts, this.max);
    this.visible = visible;
    const paused = this.pauses.size > 0;
    for (const toast of visible) {
      toast.paused = paused;
      toast.queued = false;
    }
    for (const toast of queued) toast.queued = true;
    this.announce(added);
    this.showRegion(visible.length > 0);
  };

  private showRegion(show: boolean): void {
    const region = this.region;
    // Without the Popover API the region stays in the page as a fixed box, always laid out.
    if (!region || show === this.shown || !("showPopover" in region)) return;
    this.shown = show;
    if (show) region.showPopover();
    else region.hidePopover();
  }

  private handleToggle = (event: Event): void => {
    this.shown = (event as Event & { newState?: string }).newState === "open";
  };

  private announce(toasts: readonly RegionToast[]): void {
    const lines = new Map<HTMLElement, string[]>();
    for (const toast of toasts) {
      const announcer = toast.variant === "danger" ? this.assertive : this.polite;
      if (!announcer) continue;
      const parts = [toast.heading ?? "", toast.description ?? ""].filter((part) => part !== "");
      lines.set(announcer, [...(lines.get(announcer) ?? []), ...parts]);
    }
    for (const [announcer, parts] of lines) {
      if (parts.length === 0) continue;
      this.later(ANNOUNCE_DELAY_MS, () => {
        say(announcer, parts);
        const said = announcer.textContent;
        this.later(ANNOUNCEMENT_LIFETIME_MS, () => {
          if (announcer.textContent === said) say(announcer, []);
        });
      });
    }
  }

  private later(delay: number, callback: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
  }

  private setPause(reason: PauseReason, on: boolean): void {
    if (on === this.pauses.has(reason)) return;
    if (on) this.pauses.add(reason);
    else this.pauses.delete(reason);
    const paused = this.pauses.size > 0;
    for (const toast of this.visible) toast.paused = paused;
  }

  private handlePointerEnter = (): void => {
    this.setPause("hover", true);
  };

  private handlePointerLeave = (): void => {
    this.setPause("hover", false);
  };

  private motionChanged = (): void => {
    this.setPause("motion", this.motion?.matches === true);
  };

  render() {
    const position = oneOf(TOAST_POSITIONS, this.position, "bottom-end");
    return [
      <section
        ref={(element) => (this.region = element)}
        class={{ region: true, [`position-${position}`]: true }}
        part="region"
        aria-label={this.label}
        aria-keyshortcuts={this.hotkey}
        tabindex="-1"
        popover="manual"
        onToggle={this.handleToggle}
      >
        <slot onSlotchange={this.sync} />
      </section>,
      <div
        ref={(element) => (this.polite = element)}
        class="visually-hidden"
        aria-live="polite"
        aria-atomic="true"
      />,
      <div
        ref={(element) => (this.assertive = element)}
        class="visually-hidden"
        aria-live="assertive"
        aria-atomic="true"
      />,
    ];
  }
}
