import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
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
 * This is a convenience for the interface, not access control: the content is still in the page
 * for anyone who reads its markup, and only the API decides what a request may read or change.
 *
 * @slot - What only a signed-in user sees.
 * @slot fallback - What is shown while nobody is signed in, such as a sign-in form or link.
 * @slot pending - What is shown while the client does not know yet, such as a skeleton.
 * @part unreachable - The notice shown when the restore could not reach the server.
 * @part retry - Its "Try again" button. The guard also tries again when the browser is back online.
 */
@Component({
  tag: "idg-session-guard",
  styleUrl: "session-guard.css",
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
    this.restoring.stop();
    this.bind();
  }

  private bind(): void {
    this.binding.bind(this.client);
    if (this.binding.current() === undefined) this.status = UNKNOWN.status;
  }

  private show(state: IdentityStateView): void {
    this.status = state.status;
    this.report(
      state.status === "signed-out"
        ? { status: "signed-out", reason: state.reason }
        : { status: state.status },
    );
  }

  private report(detail: SessionChangeDetail): void {
    if (detail.status === this.reported) return;
    this.reported = detail.status;
    this.idgSessionChange.emit(detail);
  }

  render() {
    if (this.status === "signed-in") return <slot />;
    if (this.status === "signed-out") return <slot name="fallback" />;
    if (this.unreachable) {
      const labels = mergeLabels(SESSION_GUARD_LABELS, this.labels);
      return (
        <idg-alert class="unreachable" part="unreachable" variant="warning">
          <span class="message">{labels.unreachable}</span>
          <idg-button
            class="retry"
            part="retry"
            variant="secondary"
            size="sm"
            onClick={this.restoring.retry}
          >
            {labels.retry}
          </idg-button>
        </idg-alert>
      );
    }
    return <slot name="pending" />;
  }
}
