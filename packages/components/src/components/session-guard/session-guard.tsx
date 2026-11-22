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
import { AnnouncementView } from "../../identity/feedback-view";
import { focusWithin } from "../../identity/focus-region";
import type { Announcement } from "../../identity/form-feedback";
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
 * How long a sign-out this tab asked for waits for the guarded content to say how it went before
 * focus settles on the fallback: a notice that follows would otherwise move focus a second time.
 */
const OUTCOME_WAIT_MS = 1000;

/** Where focus goes after the next render: the guard's region, or the notice inside it. */
type FocusTarget = "region" | "notice";

/**
 * Shows its content only while someone is signed in, through the identity client it is given in
 * `client`. Until then the default slot is not drawn at all, so the content never flashes: the
 * `pending` slot shows while the client does not know yet (the guard calls `restore()` once), and
 * the `fallback` slot once it knows nobody is signed in. Another tab's sign-out hides the content
 * at once.
 *
 * This is a convenience for the interface, not access control: the content is still in the page
 * for anyone who reads its markup, and only the API decides what a request may read or change.
 *
 * @slot - What only a signed-in user sees.
 * @slot fallback - What is shown while nobody is signed in, such as a sign-in form or link.
 * @slot pending - What is shown while the client does not know yet, such as a skeleton.
 * @slot sign-out-outcome - Your own words for a sign-out the server could not confirm, in place
 *   of the default text.
 * @part region - The guard's own box around what it shows, named by the `region` label. Focus goes
 *   there when what had focus is taken away, as by a sign-in through the fallback; it is not in the
 *   Tab order, and the design's focus ring shows on it only for keyboard users.
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
  @State() private announcement: Announcement = { text: "", slot: 0 };
  /** The notice takes focus, which reads it, so it leaves out its live role to be said once. */
  @State() private noticeTakesFocus = false;

  /** Set when what had focus is taken away by a transition: focus goes there after rendering. */
  private focusTarget?: FocusTarget;
  /** Running while a sign-out from the content waits for its outcome; see `OUTCOME_WAIT_MS`. */
  private outcomeWait?: ReturnType<typeof setTimeout>;

  private reported?: SessionChangeDetail["status"];
  private readonly restoring = new RestoreWatch<SessionGuardClient>(
    () => this.binding.current(),
    (unreachable) => {
      this.unreachable = unreachable;
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
    this.stopWaiting();
  }

  @Watch("client")
  clientChanged(): void {
    if (!this.host.isConnected) return;
    // The first state the new client reports is announced even when it is the same status.
    this.reported = undefined;
    this.unreachable = false;
    this.clearNotice();
    this.stopWaiting();
    this.restoring.stop();
    this.bind();
  }

  // From the guarded content, which goes as soon as the client is signed out.
  @Listen("idgSignedOut")
  handleSignedOut(event: CustomEvent<SignedOutDetail>): void {
    const waited = this.stopWaiting();
    if (event.detail.outcome !== "server-unreachable") {
      if (waited) this.settle();
      return;
    }
    this.signOutNotice = event.detail.everywhere === true ? "everywhere" : "this-device";
    // The warning matters more than the fallback, so it takes focus, and only it is said.
    if (waited || focusWithin(this.host)) {
      this.noticeTakesFocus = true;
      this.focusTarget = "notice";
    }
  }

  private dismissNotice = (event: CustomEvent<void>): void => {
    event.preventDefault();
    if (focusWithin(this.host)) this.focusRegion();
    this.clearNotice();
  };

  private retry = (): void => {
    // The button goes while the guard tries again, and comes back if that fails too.
    if (focusWithin(this.host)) this.focusRegion();
    this.restoring.retry();
  };

  private clearNotice(): void {
    this.signOutNotice = undefined;
    this.noticeTakesFocus = false;
  }

  private renderSignOutNotice(labels: SessionGuardLabels) {
    if (this.signOutNotice === undefined) return null;
    return (
      <div class="notice focusable" tabindex="-1">
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
        </idg-alert>
      </div>
    );
  }

  private bind(): void {
    this.binding.bind(this.client);
    if (this.binding.current() === undefined) this.status = UNKNOWN.status;
  }

  private show(state: IdentityStateView): void {
    const known = state.status !== "unknown" && this.status !== "unknown";
    if (state.status !== "signed-out") this.stopWaiting();
    if (known && state.status !== this.status && focusWithin(this.host)) {
      // A sign-out this tab asked for, most likely from the content: how it went may follow.
      if (state.status === "signed-out" && state.reason === "user") this.waitForOutcome();
      else this.focusTarget = "region";
      if (this.focusTarget) this.announceStatus(state.status);
    }
    this.status = state.status;
    this.report(
      state.status === "signed-out"
        ? { status: "signed-out", reason: state.reason }
        : { status: state.status },
    );
  }

  private waitForOutcome(): void {
    this.stopWaiting();
    this.outcomeWait = setTimeout(() => {
      this.outcomeWait = undefined;
      this.settle();
    }, OUTCOME_WAIT_MS);
  }

  /** Whether a wait was running. */
  private stopWaiting(): boolean {
    if (this.outcomeWait === undefined) return false;
    clearTimeout(this.outcomeWait);
    this.outcomeWait = undefined;
    return true;
  }

  /** Focus to the region, and the change said, once nothing more is to follow. */
  private settle(): void {
    this.focusTarget = "region";
    this.announceStatus(this.status);
  }

  private announceStatus(status: IdentityStatus): void {
    const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
    this.announce(status === "signed-in" ? labels.signedIn : labels.signedOut);
  }

  private announce(text: string): void {
    this.announcement = { text, slot: this.announcement.slot === 0 ? 1 : 0 };
  }

  private focusRegion(): void {
    this.host.shadowRoot?.querySelector<HTMLElement>(".region")?.focus();
  }

  componentDidRender(): void {
    const target = this.focusTarget;
    if (target === undefined) return;
    this.focusTarget = undefined;
    if (target === "notice") {
      this.host.shadowRoot?.querySelector<HTMLElement>(".notice")?.focus();
    } else {
      this.focusRegion();
    }
  }

  private report(detail: SessionChangeDetail): void {
    if (detail.status === this.reported) return;
    this.reported = detail.status;
    this.idgSessionChange.emit(detail);
  }

  private renderContent(labels: SessionGuardLabels) {
    if (this.status === "signed-in") return <slot />;
    if (this.status === "signed-out") {
      return [this.renderSignOutNotice(labels), <slot name="fallback" />];
    }
    if (this.unreachable) {
      return (
        <idg-alert class="unreachable" part="unreachable" variant="warning">
          <span class="message">{labels.unreachable}</span>
          <idg-button class="retry" part="retry" variant="secondary" size="sm" onClick={this.retry}>
            {labels.retry}
          </idg-button>
        </idg-alert>
      );
    }
    return <slot name="pending" />;
  }

  render() {
    const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
    return [
      <div
        class="region focusable"
        part="region"
        role="group"
        aria-label={labels.region}
        tabindex="-1"
      >
        {this.renderContent(labels)}
      </div>,
      <AnnouncementView announcement={this.announcement} />,
    ];
  }
}
