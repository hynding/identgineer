import { h } from "@stencil/core";
import { Attempts } from "../../identity/attempts";
import type { SignedOutDetail } from "../../identity/event-details";
import { AnnouncementView } from "../../identity/feedback-view";
import type { Announcement } from "../../identity/form-feedback";
import { readIdentityError } from "../../identity/identity-error";
import type { SessionView } from "../../identity/identity-types";
import { fillTemplate } from "../../identity/labels";
import type { ProfileLabels } from "./profile-labels";
import type { LoadState, SectionHost } from "./profile-section";
import type { SessionRevokedDetail } from "./profile-types";

interface SessionsEvents {
  readonly revoked: (detail: SessionRevokedDetail) => void;
  readonly signedOut: (detail: SignedOutDetail) => void;
}

/** The time a session was last used, in the page's language. */
function formatTime(value: string, locale: string | undefined): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(time);
}

/**
 * The account's sessions, this one marked, each other one with a button that signs it out, and
 * "Sign out everywhere". On a backend without sessions the list is said to be unavailable.
 */
export class SessionsSection {
  load: LoadState = "loading";
  sessions: readonly SessionView[] = [];
  busy = false;
  announcement: Announcement = { text: "", slot: 0 };
  /** Set when signing out everywhere could not reach the server, or failed. */
  outcome?: "server-unreachable" | "error";

  private readonly loads = new Attempts();

  constructor(
    private readonly host: SectionHost,
    private readonly events: SessionsEvents,
  ) {}

  async fetch(): Promise<void> {
    const client = this.host.client();
    if (!client) return;
    const load = this.loads.start();
    try {
      const sessions = await client.listSessions();
      if (!this.loads.isCurrent(load)) return;
      this.sessions = sessions;
      this.load = "ready";
    } catch (error) {
      if (!this.loads.isCurrent(load)) return;
      this.load = readIdentityError(error).code === "network" ? "network" : "failed";
    }
    this.host.changed();
  }

  /** Forgets the list. The sign-out outcome stays: it is about the sign-out just done. */
  reset(): void {
    this.loads.cancel();
    this.load = "loading";
    this.sessions = [];
    this.busy = false;
  }

  private announce(text: string): void {
    this.announcement = { text, slot: this.announcement.slot === 0 ? 1 : 0 };
  }

  private async revoke(session: SessionView): Promise<void> {
    const client = this.host.client();
    if (this.busy || !client) return;
    this.busy = true;
    this.host.changed();
    try {
      await client.revokeSession(session.id);
      if (client !== this.host.client()) return;
      this.announce(this.host.labels().sessionRevoked);
      this.events.revoked({ id: session.id });
      await this.fetch();
    } catch (error) {
      if (client !== this.host.client()) return;
      const { code } = readIdentityError(error);
      const labels = this.host.labels();
      this.announce(code === "network" ? labels.errorNetwork : labels.errorUnknown);
    } finally {
      this.busy = false;
      this.host.changed();
    }
  }

  private signOutEverywhere = async (): Promise<void> => {
    const client = this.host.client();
    if (this.busy || !client) return;
    this.busy = true;
    this.outcome = undefined;
    this.host.changed();
    try {
      const { outcome } = await client.signOut({ everywhere: true });
      if (client !== this.host.client()) return;
      if (outcome === "server-unreachable") this.outcome = outcome;
      this.events.signedOut({ outcome, everywhere: true });
    } catch {
      if (client === this.host.client()) this.outcome = "error";
    } finally {
      if (client === this.host.client()) this.busy = false;
      this.host.changed();
    }
  };

  dismissOutcome = (event: CustomEvent<void>): void => {
    event.preventDefault();
    this.outcome = undefined;
    this.host.changed();
  };

  private retryLoad = (): void => {
    this.load = "loading";
    this.host.changed();
    void this.fetch();
  };

  private renderSession(session: SessionView, labels: ProfileLabels, locale: string | undefined) {
    const device = session.deviceName ?? labels.unknownDevice;
    return (
      <li class="session" part="session">
        <span class="session-device">
          {device}
          {session.current ? (
            <idg-badge class="session-current">{labels.thisDevice}</idg-badge>
          ) : null}
        </span>
        <span class="note">
          {fillTemplate(labels.lastActive, { time: formatTime(session.lastActiveAt, locale) })}
        </span>
        {session.current ? null : (
          <idg-button
            class="revoke"
            variant="secondary"
            size="sm"
            disabled={this.busy}
            onClick={() => {
              void this.revoke(session);
            }}
          >
            {labels.revokeSession}
            <span class="visually-hidden"> {device}</span>
          </idg-button>
        )}
      </li>
    );
  }

  private renderList(labels: ProfileLabels, locale: string | undefined) {
    if (this.load === "loading") return <idg-skeleton class="placeholder" lines={2} />;
    if (this.load === "network") {
      return (
        <p class="note">
          {labels.errorNetwork}{" "}
          <idg-button class="retry" variant="secondary" size="sm" onClick={this.retryLoad}>
            {labels.retry}
          </idg-button>
        </p>
      );
    }
    if (this.load === "failed") return <p class="note">{labels.sessionsUnavailable}</p>;
    return (
      <ul class="sessions">
        {this.sessions.map((session) => this.renderSession(session, labels, locale))}
      </ul>
    );
  }

  renderOutcome(labels: ProfileLabels) {
    if (this.outcome === undefined) return null;
    return (
      <idg-alert
        part="outcome"
        variant="warning"
        dismissible
        dismissLabel={labels.dismiss}
        onIdgDismiss={this.dismissOutcome}
      >
        {this.outcome === "error" ? labels.errorUnknown : labels.serverUnreachable}
      </idg-alert>
    );
  }

  render(labels: ProfileLabels, locale: string | undefined) {
    return (
      <div class="section-body" part="sessions">
        {this.renderList(labels, locale)}
        <idg-button
          class="sign-out-everywhere"
          variant="danger"
          loading={this.busy}
          onClick={() => {
            void this.signOutEverywhere();
          }}
        >
          {labels.signOutEverywhere}
        </idg-button>
        <AnnouncementView announcement={this.announcement} />
      </div>
    );
  }
}
