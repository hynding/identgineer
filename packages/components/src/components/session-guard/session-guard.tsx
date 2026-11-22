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
import type { SignedOutDetail } from "../../identity/event-details";
import { focusWithin } from "../../identity/focus-region";
import type {
  IdentityStateView,
  IdentityStatus,
  SessionGuardClient,
} from "../../identity/identity-types";
import { mergeLabels } from "../../identity/labels";
import { RestoreWatch } from "../../identity/restore-watch";
import { StateBinding } from "../../identity/state-binding";
import { SESSION_GUARD_LABELS, type SessionGuardLabels } from "./session-guard-labels";
import type { SessionChangeDetail } from "./session-guard-types";

const UNKNOWN: IdentityStateView = { status: "unknown" };

/**
 * Shows its content only while someone is signed in, through the identity client it is given in
 * `client`. Until then the default slot is not drawn at all, so the content never flashes: the
 * `pending` slot shows while the client does not know yet (the guard calls `restore()` once), and
 * the `fallback` slot once it knows nobody is signed in. Another tab's sign-out hides the content
 * at once.
 *
 * The guard adds no box around what it shows: the host is `display: contents` and the slots are
 * its shadow root's own children, so slotted elements are the parent's flex or grid items. When a
 * transition takes away what had focus, focus goes to a hidden anchor of the guard's own, placed
 * before the content and out of the page's layout, whose text says the change; Tab goes on into
 * the content. A notice, when the guard shows one, is one block before the content.
 *
 * This is a convenience for the interface, not access control: the content is still in the page
 * for anyone who reads its markup, and only the API decides what a request may read or change.
 *
 * @slot - What only a signed-in user sees.
 * @slot fallback - What is shown while nobody is signed in, such as a sign-in form or link.
 * @slot pending - What is shown while the client does not know yet, such as a skeleton.
 * @slot sign-out-outcome - Your own words for a sign-out the server could not confirm, in place
 *   of the default text.
 * @part notice - The block, before the content, that holds either notice below. It takes focus
 *   when it appears while focus is on the guard's anchor.
 * @part unreachable - The notice shown when the restore could not reach the server.
 * @part retry - Its "Try again" button. The guard also tries again when the browser is back online.
 * @part sign-out-outcome - Above the fallback: a sign-out from the guarded content (such as
 *   idg-profile's "Sign out everywhere") that the server could not confirm. The content that would
 *   have said so is gone, so the guard says it.
 */
@Component({
  tag: "idg-session-guard",
  styleUrls: [
    "../../styles/focus-ring.css",
    "../../styles/visually-hidden.css",
    "session-guard.css",
  ],
  shadow: true,
})
export class IdgSessionGuard {
  @Element() host!: HTMLElement;

  /** The identity client (a JavaScript property). The element never creates one. */
  @Prop() client?: SessionGuardClient;

  /** The text of the guard's own notices, merged over the English defaults. */
  @Prop() labels?: Partial<SessionGuardLabels>;

  /** Fires when what the guard shows changes, and with the first state each client reports. */
  @Event() idgSessionChange!: EventEmitter<SessionChangeDetail>;

  @State() private status: IdentityStatus = "unknown";
  @State() private unreachable = false;
  @State() private signOutNotice?: "this-device" | "everywhere";
  /** What the anchor says while it has focus; nothing otherwise. */
  @State() private anchorText = "";
  /** The notice takes focus, which reads it, so it leaves out its live role to be said once. */
  @State() private noticeTakesFocus = false;

  /** Where focus is to go after the next render, if anywhere. */
  private focusNext?: "anchor" | "notice";

  private reported?: SessionChangeDetail["status"];
  private readonly restoring = new RestoreWatch<SessionGuardClient>(
    () => this.binding.current(),
    (unreachable) => {
      this.unreachable = unreachable;
      // Back after a Try again that failed too, while focus waits on the anchor.
      if (unreachable && this.anchorHasFocus()) this.moveToNotice();
      this.report({ status: unreachable ? "unreachable" : "unknown" });
    },
  );
  private readonly binding = new StateBinding<SessionGuardClient>((state, client) => {
    if (state.status === "unknown") this.restoring.start(client);
    else {
      this.unreachable = false;
      this.restoring.stop();
    }
    if (state.status === "signed-in") this.clearNotice();
    this.show(state);
  });

  connectedCallback(): void {
    this.bind();
  }

  disconnectedCallback(): void {
    this.binding.unbind();
    this.restoring.stop();
  }

  @Watch("client")
  clientChanged(): void {
    if (!this.host.isConnected) return;
    // The first state the new client reports is announced even when it is the same status.
    this.reported = undefined;
    this.unreachable = false;
    this.clearNotice();
    this.restoring.stop();
    this.bind();
  }

  // From the guarded content, which goes as soon as the client is signed out.
  @Listen("idgSignedOut")
  handleSignedOut(event: CustomEvent<SignedOutDetail>): void {
    if (event.detail.outcome !== "server-unreachable") return;
    this.signOutNotice = event.detail.everywhere === true ? "everywhere" : "this-device";
    // Focus moves on to the warning only from the anchor; a user who has moved on hears it said.
    if (this.anchorHasFocus()) this.moveToNotice();
    else this.noticeTakesFocus = false;
  }

  private dismissNotice = (event: CustomEvent<void>): void => {
    event.preventDefault();
    const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
    if (focusWithin(this.host)) this.focusAnchor(labels.signedOut);
    this.clearNotice();
  };

  private retry = (): void => {
    // The button goes while the guard tries again, and comes back if that fails too.
    const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
    if (focusWithin(this.host)) this.focusAnchor(labels.checking);
    this.restoring.retry();
  };

  private clearNotice(): void {
    this.signOutNotice = undefined;
    this.noticeTakesFocus = false;
  }

  private moveToNotice(): void {
    this.noticeTakesFocus = true;
    this.focusNext = "notice";
  }

  private bind(): void {
    this.binding.bind(this.client);
    if (this.binding.current() === undefined) this.status = UNKNOWN.status;
  }

  private show(state: IdentityStateView): void {
    const known = state.status !== "unknown" && this.status !== "unknown";
    const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
    const text = state.status === "signed-in" ? labels.signedIn : labels.signedOut;
    if (known && state.status !== this.status && focusWithin(this.host)) {
      this.focusAnchor(text);
    } else if (state.status !== "unknown" && this.anchorHasFocus()) {
      // Known at last after a Try again: the anchor says what is now shown.
      this.anchorText = text;
    }
    this.status = state.status;
    this.report(
      state.status === "signed-out"
        ? { status: "signed-out", reason: state.reason }
        : { status: state.status },
    );
  }

  private anchor(): HTMLElement | null | undefined {
    return this.host.shadowRoot?.querySelector<HTMLElement>(".focus-anchor");
  }

  /** Whether focus is on the anchor, or is about to be. */
  private anchorHasFocus(): boolean {
    if (this.focusNext === "anchor") return true;
    const anchor = this.anchor();
    return (
      anchor !== null && anchor !== undefined && this.host.shadowRoot?.activeElement === anchor
    );
  }

  /**
   * Focuses the anchor, after the next render, with `text` as what it says. The text is in place
   * before it takes focus, so a screen reader reads it once, as focus lands; no live region
   * repeats it.
   */
  private focusAnchor(text: string): void {
    this.anchorText = text;
    this.focusNext = "anchor";
  }

  private anchorBlurred = (): void => {
    this.anchorText = "";
  };

  componentDidRender(): void {
    const target = this.focusNext;
    if (target === undefined) return;
    this.focusNext = undefined;
    const selector = target === "notice" ? ".notice" : ".focus-anchor";
    this.host.shadowRoot?.querySelector<HTMLElement>(selector)?.focus();
  }

  private report(detail: SessionChangeDetail): void {
    if (detail.status === this.reported) return;
    this.reported = detail.status;
    this.idgSessionChange.emit(detail);
  }

  private renderNotice(content: unknown) {
    return (
      <div class="notice focusable" part="notice" tabindex="-1">
        {content}
      </div>
    );
  }

  private renderSignOutNotice(labels: SessionGuardLabels) {
    if (this.signOutNotice === undefined) return null;
    return this.renderNotice(
      <idg-alert
        class="sign-out-outcome"
        part="sign-out-outcome"
        variant="warning"
        quiet={this.noticeTakesFocus}
        dismissible
        dismissLabel={labels.dismiss}
        onIdgDismiss={this.dismissNotice}
      >
        <slot name="sign-out-outcome">
          {this.signOutNotice === "everywhere"
            ? labels.signOutEverywhereUnreachable
            : labels.signOutUnreachable}
        </slot>
      </idg-alert>,
    );
  }

  private renderUnreachable(labels: SessionGuardLabels) {
    return this.renderNotice(
      <idg-alert
        class="unreachable"
        part="unreachable"
        variant="warning"
        quiet={this.noticeTakesFocus}
      >
        <span class="message">{labels.unreachable}</span>
        <idg-button class="retry" part="retry" variant="secondary" size="sm" onClick={this.retry}>
          {labels.retry}
        </idg-button>
      </idg-alert>,
    );
  }

  private renderContent(labels: SessionGuardLabels) {
    if (this.status === "signed-in") return <slot />;
    if (this.status === "signed-out") {
      return [this.renderSignOutNotice(labels), <slot name="fallback" />];
    }
    if (this.unreachable) return this.renderUnreachable(labels);
    return <slot name="pending" />;
  }

  render() {
    const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
    // The anchor is out of the page's layout (absolutely positioned), so it is no flex or grid
    // item; it comes first, so Tab from it enters what the guard shows.
    return [
      <span class="focus-anchor visually-hidden" tabindex="-1" onBlur={this.anchorBlurred}>
        {this.anchorText}
      </span>,
      this.renderContent(labels),
    ];
  }
}
