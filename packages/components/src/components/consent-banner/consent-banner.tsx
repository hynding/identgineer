import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Prop,
  State,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { mergeLabels } from "../../identity/labels";
import { announce, NO_ANNOUNCEMENT, type Announcement } from "../../consent/announcement";
import { AnnouncementView } from "../../consent/announcement-view";
import { attempt } from "../../consent/attempt";
import { ConsentBinding } from "../../consent/consent-binding";
import type {
  ConsentChangeDetail,
  ConsentClient,
  ConsentStatusView,
} from "../../consent/consent-types";
import { returnFocus } from "../../consent/focus-return";
import { ReserveSpace } from "../../consent/reserve-space";
import { oneOf } from "../../utils/choice";
import { CONSENT_BANNER_LABELS, type ConsentBannerLabels } from "./consent-banner-labels";
import { CONSENT_PLACEMENTS, type ConsentPlacement } from "./consent-banner-options";

interface PreferencesPanel extends HTMLElement {
  open?: () => unknown;
  modal?: boolean;
}

/**
 * Asks once whether analytics may be switched on, for the consent object it is given in `consent`
 * (the tracker's `tracker.consent`). It is a region of the page, not a dialog: it never blocks
 * anything, takes no focus when it appears, and ignoring it, or pressing Escape, means no consent.
 *
 * It asks only while the state is `unknown` and no browser privacy signal is set. Under Global
 * Privacy Control or Do Not Track it does not ask at all, since asking would invite a choice the
 * browser has already made: it draws nothing, or, with `announce-signal`, one line saying the
 * signal is respected. "Decline" comes first and has the same variant and size as "Accept
 * analytics". After a choice, focus goes back to what had it before the banner, else to the main
 * landmark, and a polite live region confirms it.
 *
 * `placement` `bottom` (the default) makes the host stick to the bottom edge of the window while its
 * natural place is further on, so it keeps its space in the page's flow and never covers the end
 * of the page, and the banner keeps the page's scroll padding as tall as itself, so a focused
 * element is scrolled clear of it. In a window too short for both, it joins the page's flow
 * instead and the page itself scrolls. `top` and `inline` are in the page's flow where the element
 * is: a bar at the top scrolls away with the page and never covers a header that sticks.
 *
 * @slot message - The question, in place of the default words.
 * @slot policy - A link to the privacy policy, after the message.
 * @slot preferences - An `idg-consent-preferences` that "Choose" opens. A panel that is not modal
 *   is drawn only after "Choose".
 * @part banner - The region.
 * @part message - The question and the policy link.
 * @part choices - The row of buttons.
 * @part decline - The "Decline" button.
 * @part accept - The "Accept analytics" button.
 * @part choose - The "Choose" button.
 * @part error - The alert shown when the choice could not be stored.
 * @part signal-note - The line shown under a privacy signal when `announce-signal` is set.
 * @part status - The out-of-sight live region that confirms a choice.
 */
@Component({
  tag: "idg-consent-banner",
  styleUrls: ["../../styles/visually-hidden.css", "consent-banner.css"],
  shadow: true,
})
export class IdgConsentBanner {
  @Element() host!: HTMLElement;

  /** The tracker's consent object, `tracker.consent` (a JavaScript property). */
  @Prop() consent?: ConsentClient;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<ConsentBannerLabels>;

  /** `bottom` (the default): a bar that stays in view; `top` and `inline`: in the page's flow. */
  @Prop({ reflect: true }) placement: ConsentPlacement = "bottom";

  /** Under a browser privacy signal, say in one line that it is respected, instead of nothing. */
  @Prop({ attribute: "announce-signal", reflect: true }) announceSignal = false;

  /** The id of an `idg-consent-preferences` elsewhere in the page that "Choose" opens. */
  @Prop() preferences?: string;

  /**
   * Fires when the user chooses here, with the state that is now stored. A change made elsewhere
   * (another tab, the preferences) is not announced by it: subscribe with `consent.onChange`.
   */
  @Event() idgConsentChange!: EventEmitter<ConsentChangeDetail>;

  /** Fires when "Choose" is pressed. Call `preventDefault()` to open the preferences yourself. */
  @Event({ cancelable: true }) idgConsentChoose!: EventEmitter<void>;

  @State() private status?: ConsentStatusView;
  @State() private unavailable = false;
  @State() private saveFailed = false;
  @State() private announcement: Announcement = NO_ANNOUNCEMENT;
  @State() private preferencesShown = false;

  private focusInside = false;
  private returnTarget?: EventTarget;
  private wasAsking = false;
  private openAfterRender?: PreferencesPanel;
  private readonly reserve = new ReserveSpace();
  private readonly binding = new ConsentBinding(
    (status) => {
      this.status = status;
      this.unavailable = false;
    },
    () => {
      this.unavailable = true;
    },
  );

  connectedCallback(): void {
    this.bind();
  }

  disconnectedCallback(): void {
    this.binding.unbind();
    this.reserve.stop();
  }

  @Watch("consent")
  consentChanged(): void {
    if (!this.host.isConnected) return;
    this.bind();
  }

  // What was said about the last consent object is no longer true.
  private bind(): void {
    this.status = undefined;
    this.unavailable = false;
    this.saveFailed = false;
    this.announcement = NO_ANNOUNCEMENT;
    this.binding.bind(undefined);
    this.binding.bind(this.consent);
  }

  // Where focus was before it came here, so that it can go back once the choice is made. The flag
  // says whether focus is in the banner as far as the visitor is concerned, which an element
  // removed while it has focus does not end.
  @Listen("focusin")
  handleFocusIn(event: globalThis.FocusEvent): void {
    if (this.focusInside) return;
    this.focusInside = true;
    this.returnTarget = event.relatedTarget ?? undefined;
  }

  @Listen("focusout")
  handleFocusOut(event: globalThis.FocusEvent): void {
    const next = event.relatedTarget;
    if (next !== null && this.host.contains(next as Node)) return;
    if (next !== null) {
      this.focusInside = false;
      return;
    }
    // Focus that names no new target is either the visitor moving off the page's controls or the
    // browser letting go of an element that is being removed, and Chrome reports the second while
    // the element is still attached. By the end of the task that removes it, it is not.
    const origin = (event as Partial<Event>).composedPath?.()[0] as Partial<Node> | undefined;
    queueMicrotask(() => {
      if (origin?.isConnected !== false) this.focusInside = false;
    });
  }

  componentDidRender(): void {
    this.syncReservedSpace();
    this.keepFocusThroughChange();
    const panel = this.openAfterRender;
    if (panel === undefined) return;
    this.openAfterRender = undefined;
    this.openPanel(panel);
  }

  // A change made elsewhere (the preferences inside the banner or opened from it, another tab)
  // takes the question away, and with it every control inside the banner, including a panel in its
  // slot. A browser lets go of focus on a hidden element only at its next frame, so focus that was
  // inside is put back, as after a choice made here.
  private keepFocusThroughChange(): void {
    const asking = this.isAsking();
    const removed = this.wasAsking && !asking;
    this.wasAsking = asking;
    if (!removed || !this.focusInside) return;
    returnFocus(this.returnTarget, this.host.ownerDocument);
    this.focusInside = false;
  }

  private isAsking(): boolean {
    return (
      this.status !== undefined &&
      this.status.reason === undefined &&
      this.status.state === "unknown"
    );
  }

  private syncReservedSpace(): void {
    const bar = this.host.shadowRoot?.querySelector<HTMLElement>(".banner");
    const placement = oneOf(CONSENT_PLACEMENTS, this.placement, "bottom");
    if (bar === null || bar === undefined || placement !== "bottom") {
      this.reserve.stop();
      return;
    }
    this.reserve.start(this.host);
  }

  private accept = (): void => {
    this.choose("accept");
  };

  private decline = (): void => {
    this.choose("decline");
  };

  private choose(choice: "accept" | "decline"): void {
    const consent = this.binding.current();
    if (consent === undefined || !this.stillAsking(consent)) return;
    this.saveFailed = false;
    const stored = attempt(() => (choice === "accept" ? consent.grant() : consent.deny()));
    // Read afresh: an object that does not announce its own changes is still seen to have changed.
    this.binding.refresh();
    if (!stored) {
      this.saveFailed = true;
      return;
    }
    const labels = mergeLabels(CONSENT_BANNER_LABELS, this.labels);
    this.idgConsentChange.emit({ state: choice === "accept" ? "granted" : "denied" });
    this.announcement = announce(
      this.announcement,
      choice === "accept" ? labels.acceptedAnnouncement : labels.declinedAnnouncement,
    );
    returnFocus(this.returnTarget, this.host.ownerDocument);
    this.focusInside = false;
  }

  // A second press of a button that is still drawn, a frame before it goes, finds the choice made.
  private stillAsking(consent: ConsentClient): boolean {
    try {
      const status = consent.get();
      return status.state === "unknown" && status.reason === undefined;
    } catch {
      return false;
    }
  }

  private slottedPanel(): PreferencesPanel | undefined {
    return Array.from(this.host.children).find(
      (child): child is PreferencesPanel => child.getAttribute("slot") === "preferences",
    );
  }

  private referencedPanel(): PreferencesPanel | undefined {
    const id = this.preferences;
    if (id === undefined || id === "") return undefined;
    const root = this.host.getRootNode() as Partial<Document | ShadowRoot>;
    return root.getElementById?.(id) ?? this.host.ownerDocument.getElementById(id) ?? undefined;
  }

  private openPanel(panel: PreferencesPanel): void {
    try {
      void Promise.resolve(panel.open?.()).catch(() => undefined);
    } catch {
      // A panel that fails to open is the page's to fix; the banner stays as it is.
    }
  }

  private handleChoose = (): void => {
    const event = this.idgConsentChoose.emit();
    if (event.defaultPrevented) return;
    const slotted = this.slottedPanel();
    if (slotted !== undefined) {
      if (slotted.modal === true) {
        this.openPanel(slotted);
        return;
      }
      // The panel is drawn only once it is asked for, so it is opened after that render.
      this.preferencesShown = true;
      this.openAfterRender = slotted;
      return;
    }
    const referenced = this.referencedPanel();
    if (referenced !== undefined) this.openPanel(referenced);
  };

  private renderError(text: string) {
    return (
      <idg-alert class="error" part="error" variant="danger">
        {text}
      </idg-alert>
    );
  }

  private renderAsking(labels: ConsentBannerLabels) {
    const placement = oneOf(CONSENT_PLACEMENTS, this.placement, "bottom");
    const slotted = this.slottedPanel();
    const drawsPanel = slotted !== undefined && (slotted.modal === true || this.preferencesShown);
    return (
      <div
        class={{ banner: true, [`placement-${placement}`]: true }}
        part="banner"
        role="region"
        aria-label={labels.regionName}
      >
        <div class="body">
          <div class="message" part="message">
            <slot name="message">{labels.message}</slot> <slot name="policy" />
          </div>
          {this.saveFailed ? this.renderError(labels.saveError) : null}
        </div>
        <div class="choices" part="choices">
          <idg-button
            class="decline"
            part="decline"
            variant="secondary"
            fullWidth
            onClick={this.decline}
          >
            {labels.decline}
          </idg-button>
          <idg-button
            class="accept"
            part="accept"
            variant="secondary"
            fullWidth
            onClick={this.accept}
          >
            {labels.accept}
          </idg-button>
          <idg-button
            class="choose"
            part="choose"
            variant="ghost"
            fullWidth
            accessibleExpanded={
              slotted !== undefined && slotted.modal !== true ? this.preferencesShown : undefined
            }
            onClick={this.handleChoose}
          >
            {labels.choose}
          </idg-button>
        </div>
        {drawsPanel ? (
          <div class="preferences" part="preferences">
            <slot name="preferences" />
          </div>
        ) : null}
      </div>
    );
  }

  private renderState(labels: ConsentBannerLabels) {
    const status = this.status;
    if (this.unavailable) return this.renderError(labels.unavailable);
    if (status === undefined) return null;
    if (status.reason !== undefined) {
      if (!this.announceSignal) return null;
      return (
        <p class="signal-note" part="signal-note" role="status">
          {status.reason === "gpc" ? labels.signalGpc : labels.signalDnt}
        </p>
      );
    }
    return status.state === "unknown" ? this.renderAsking(labels) : null;
  }

  render() {
    // Without a consent object there is nothing to ask about, so nothing is drawn at all.
    if (this.binding.current() === undefined) return null;
    const labels = mergeLabels(CONSENT_BANNER_LABELS, this.labels);
    return [this.renderState(labels), <AnnouncementView announcement={this.announcement} />];
  }
}
