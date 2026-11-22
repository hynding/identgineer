import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import type { SignedOutDetail } from "../../identity/event-details";
import type {
  IdentityStateView,
  IdentityUserView,
  ProfileClient,
} from "../../identity/identity-types";
import { mergeLabels } from "../../identity/labels";
import { restoreOnce } from "../../identity/restore-once";
import { StateBinding } from "../../identity/state-binding";
import { systemTimers, type CountdownClock } from "../../identity/throttle-countdown";
import { DetailsSection } from "./profile-details";
import { PROFILE_LABELS, type ProfileLabels } from "./profile-labels";
import { PasswordSection } from "./profile-password";
import type { SectionHost } from "./profile-section";
import { SessionsSection } from "./profile-sessions";
import type { ProfileSavedDetail, SessionRevokedDetail } from "./profile-types";

/**
 * The signed-in owner's account, for the identity client it is given in `client`: their `Profile`
 * (display name, about, language, time zone and email preference), a password change, and the
 * sessions of the account with a button to sign each other one out and one to sign out everywhere.
 * Avatars are not uploaded here; the page can show the one it has with `avatar-src`.
 *
 * @part details - The profile form.
 * @part details-saved - The confirmation of a saved profile.
 * @part password - The password form.
 * @part password-saved - The confirmation of a changed password.
 * @part byte-count - How many of the new password's 72 bytes are used.
 * @part sessions - The sessions and "Sign out everywhere".
 * @part session - One session.
 * @part error - The summary of a failed attempt, in each form (`role="alert"`).
 * @part throttle - The countdown while attempts are refused.
 * @part outcome - Signing out everywhere could not reach the server, or failed.
 * @part signed-out - The note shown while nobody is signed in.
 */
@Component({
  tag: "idg-profile",
  styleUrls: ["../../styles/visually-hidden.css", "../../styles/identity-form.css", "profile.css"],
  shadow: true,
})
export class IdgProfile {
  @Element() host!: HTMLElement;

  /** The identity client (a JavaScript property). The element never creates one. */
  @Prop() client?: ProfileClient;

  /** A picture of the owner for the avatar, such as the one their profile links to. */
  @Prop() avatarSrc?: string;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<ProfileLabels>;

  /** Timers for the throttle countdown; the browser's by default. For tests. */
  @Prop() clock?: CountdownClock;

  /** Fires after the profile is saved, with the saved fields. */
  @Event() idgProfileSaved!: EventEmitter<ProfileSavedDetail>;

  /** Fires after the password is changed. It carries nothing. */
  @Event() idgPasswordChanged!: EventEmitter<void>;

  /** Fires after another session is signed out, with its id. */
  @Event() idgSessionRevoked!: EventEmitter<SessionRevokedDetail>;

  /** Fires after "Sign out everywhere", with how it went. Navigating on is the page's job. */
  @Event() idgSignedOut!: EventEmitter<SignedOutDetail>;

  @State() private state: IdentityStateView = { status: "unknown" };
  // Bumped whenever a section changes, so the element draws it again.
  @State() private version = 0;

  private readonly sectionHost: SectionHost = {
    client: () => this.binding.current(),
    labels: () => this.text(),
    timers: () => this.clock ?? systemTimers,
    changed: () => {
      this.version += 1;
    },
  };
  private readonly details = new DetailsSection(this.sectionHost, (detail) =>
    this.idgProfileSaved.emit(detail),
  );
  private readonly password = new PasswordSection(this.sectionHost, () => {
    this.idgPasswordChanged.emit();
    // The server ended every other session.
    void this.sessions.fetch();
  });
  private readonly sessions = new SessionsSection(this.sectionHost, {
    revoked: (detail) => this.idgSessionRevoked.emit(detail),
    signedOut: (detail) => this.idgSignedOut.emit(detail),
  });
  private readonly binding = new StateBinding<ProfileClient>((state, client) => {
    if (state.status === "unknown") restoreOnce(client);
    this.follow(state);
  });
  private userId?: number;

  connectedCallback(): void {
    this.bind();
  }

  disconnectedCallback(): void {
    this.binding.unbind();
    this.forget();
  }

  componentDidRender(): void {
    this.details.afterRender();
    this.password.afterRender();
  }

  @Watch("client")
  clientChanged(): void {
    if (!this.host.isConnected) return;
    this.forget();
    this.bind();
  }

  private bind(): void {
    this.binding.bind(this.client);
    if (this.binding.current() === undefined) this.state = { status: "unknown" };
  }

  private text(): ProfileLabels {
    return mergeLabels(PROFILE_LABELS, this.labels);
  }

  // A different user (or nobody) means everything shown so far belongs to someone else.
  private follow(state: IdentityStateView): void {
    this.state = state;
    const userId = state.status === "signed-in" ? state.user.id : undefined;
    if (userId === this.userId) return;
    this.forget();
    this.userId = userId;
    if (userId === undefined) return;
    void this.details.fetch();
    void this.sessions.fetch();
  }

  private forget(): void {
    this.userId = undefined;
    this.details.reset();
    this.password.reset();
    this.sessions.reset();
  }

  private locale(): string | undefined {
    const lang = this.host.closest("[lang]")?.getAttribute("lang") ?? "";
    return lang === "" ? undefined : lang;
  }

  private renderSignedIn(user: IdentityUserView, labels: ProfileLabels) {
    const name = this.details.profile?.displayName ?? user.username;
    return [
      <section class="section" aria-labelledby="details-heading">
        <div class="owner">
          <idg-avatar name={name} src={this.avatarSrc} alt="" size="lg" />
          <h2 class="heading" id="details-heading">
            {labels.detailsHeading}
          </h2>
        </div>
        {this.details.render(user, labels)}
      </section>,
      <section class="section" aria-labelledby="password-heading">
        <h2 class="heading" id="password-heading">
          {labels.passwordHeading}
        </h2>
        {this.password.render(user, labels)}
      </section>,
      <section class="section" aria-labelledby="sessions-heading">
        <h2 class="heading" id="sessions-heading">
          {labels.sessionsHeading}
        </h2>
        {this.sessions.render(labels, this.locale())}
      </section>,
    ];
  }

  render() {
    const labels = this.text();
    const state = this.state;
    let content;
    if (state.status === "signed-in") content = this.renderSignedIn(state.user, labels);
    else if (state.status === "signed-out") {
      content = (
        <p class="note" part="signed-out">
          {labels.signedOut}
        </p>
      );
    } else content = <idg-skeleton class="placeholder" lines={6} />;
    return (
      <div class="identity">
        {this.sessions.renderOutcome(labels)}
        {content}
      </div>
    );
  }
}
