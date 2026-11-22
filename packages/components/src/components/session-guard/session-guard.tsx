import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import type {
  IdentityStateView,
  IdentityStatus,
  SessionGuardClient,
} from "../../identity/identity-types";
import { restoreOnce } from "../../identity/restore-once";
import { StateBinding } from "../../identity/state-binding";
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

  /** Fires when what the guard shows changes, and with the first state each client reports. */
  @Event() idgSessionChange!: EventEmitter<SessionChangeDetail>;

  @State() private status: IdentityStatus = "unknown";

  private reported?: IdentityStatus;
  private readonly binding = new StateBinding<SessionGuardClient>((state, client) => {
    if (state.status === "unknown") restoreOnce(client);
    this.show(state);
  });

  connectedCallback(): void {
    this.bind();
  }

  disconnectedCallback(): void {
    this.binding.unbind();
  }

  @Watch("client")
  clientChanged(): void {
    if (!this.host.isConnected) return;
    // The first state the new client reports is announced even when it is the same status.
    this.reported = undefined;
    this.bind();
  }

  private bind(): void {
    this.binding.bind(this.client);
    if (this.binding.current() === undefined) this.status = UNKNOWN.status;
  }

  private show(state: IdentityStateView): void {
    this.status = state.status;
    if (state.status === this.reported) return;
    this.reported = state.status;
    this.idgSessionChange.emit(
      state.status === "signed-out"
        ? { status: "signed-out", reason: state.reason }
        : { status: state.status },
    );
  }

  render() {
    if (this.status === "signed-in") return <slot />;
    if (this.status === "signed-out") return <slot name="fallback" />;
    return <slot name="pending" />;
  }
}
