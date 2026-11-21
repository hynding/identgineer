import { Component, Element, h, Listen, Prop, Watch } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { deepActiveElement, firstFocusable, isWithin } from "../../utils/focus";
import { ToastQueue } from "../../utils/toast-queue";
import { TOAST_POSITIONS, type ToastPosition } from "./toast-region-options";

/** A live region only speaks about a change it saw, so text is set once it has been rendered. */
const ANNOUNCE_DELAY_MS = 100;

/**
 * The announcement is cleared this long after its last line was added, so browsing the page does
 * not meet each toast twice.
 */
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

/** Adds each line in a paragraph of its own, as text, so a screen reader pauses between them. */
function addLines(announcer: HTMLElement, lines: readonly string[]): void {
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
  /** The last element outside the region to have focus, for when focus came from nowhere. */
  private lastOutside: Element | undefined;
  private motion?: MediaQueryList;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** Lines waiting to be announced, per live region. */
  private readonly pending = new Map<HTMLElement, string[]>();
  /** When each live region's current announcement is to be cleared, as a `Date.now()` time. */
  private readonly clearAt = new Map<HTMLElement, number>();
  private readonly clearTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  connectedCallback(): void {
    this.followMotionPreference();
    // Moved back into a page: its popover was hidden on the way out, so it is shown again, and
    // the announcements its timers were keeping are taken up again.
    if (!this.region) return;
    this.sync();
    this.resumeAnnouncements();
  }

  componentDidLoad(): void {
    this.region?.addEventListener("pointerenter", this.handlePointerEnter);
    this.region?.addEventListener("pointerleave", this.handlePointerLeave);
    this.sync();
  }

  // A browser hides a removed popover without a toggle event, so it is marked hidden here.
  disconnectedCallback(): void {
    this.motion?.removeEventListener("change", this.motionChanged);
    this.motion = undefined;
    this.shown = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.clearTimers.clear();
  }

  private followMotionPreference(): void {
    if (typeof window.matchMedia !== "function") return;
    this.motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.motion.addEventListener("change", this.motionChanged);
    this.motionChanged();
  }

  @Watch("max")
  maxChanged(): void {
    this.sync();
  }

  // Focus can reach a toast by Tab or a click as well as by the hotkey. Escape then sends it back
  // where it came from, or, when it came from nowhere, to the last element that had it.
  @Listen("focusin")
  handleFocusIn(event: FocusEvent): void {
    if (!this.pauses.has("focus")) {
      const from = event.relatedTarget as Element | null;
      const outside = from && !isWithin(from, this.host) ? from : this.lastOutside;
      this.returnFocus ??= outside;
    }
    this.setPause("focus", true);
  }

  @Listen("focusin", { target: "document" })
  handleDocumentFocusIn(event: FocusEvent): void {
    const target = event.composedPath()[0] as Element | undefined;
    if (target?.nodeType === Node.ELEMENT_NODE && !isWithin(target, this.host)) {
      this.lastOutside = target;
    }
  }

  @Listen("focusout")
  handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    const staying = next !== null && isWithin(next, this.host);
    // Focus moved on by itself, so there is nowhere to send it back to any more.
    if (!staying) this.returnFocus = undefined;
    this.setPause("focus", staying);
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

  // Toasts that come into view close together are gathered into one announcement, since a newer
  // text in the same live region can cut off the one before it.
  private announce(toasts: readonly RegionToast[]): void {
    for (const toast of toasts) {
      const announcer = toast.variant === "danger" ? this.assertive : this.polite;
      if (!announcer) continue;
      const parts = [toast.heading ?? "", toast.description ?? ""].filter((part) => part !== "");
      if (parts.length === 0) continue;
      const pending = this.pending.get(announcer);
      if (pending) {
        pending.push(...parts);
        continue;
      }
      this.pending.set(announcer, parts);
      this.later(ANNOUNCE_DELAY_MS, () => {
        this.flush(announcer);
      });
    }
  }

  // While an announcement is showing, new lines are added to it rather than replacing it: a live
  // region reads what is added, and a replacement could cut short the line being read.
  private flush(announcer: HTMLElement): void {
    const lines = this.pending.get(announcer);
    this.pending.delete(announcer);
    if (!lines) return;
    if (!this.clearAt.has(announcer)) announcer.textContent = "";
    addLines(announcer, lines);
    this.clearAt.set(announcer, Date.now() + ANNOUNCEMENT_LIFETIME_MS);
    this.clearLater(announcer, ANNOUNCEMENT_LIFETIME_MS);
  }

  private clearLater(announcer: HTMLElement, delay: number): void {
    const previous = this.clearTimers.get(announcer);
    if (previous !== undefined) {
      clearTimeout(previous);
      this.timers.delete(previous);
    }
    const timer = this.later(delay, () => {
      this.clearTimers.delete(announcer);
      this.clearAt.delete(announcer);
      announcer.textContent = "";
    });
    this.clearTimers.set(announcer, timer);
  }

  // Timers stop while the region is out of the page. Back in it, what was waiting is announced and
  // an announcement whose time ran out meanwhile is cleared.
  private resumeAnnouncements(): void {
    const now = Date.now();
    for (const [announcer, at] of this.clearAt) {
      if (at > now) {
        this.clearLater(announcer, at - now);
        continue;
      }
      this.clearAt.delete(announcer);
      announcer.textContent = "";
    }
    for (const announcer of this.pending.keys()) {
      this.later(ANNOUNCE_DELAY_MS, () => {
        this.flush(announcer);
      });
    }
  }

  private later(delay: number, callback: () => void): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return timer;
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
