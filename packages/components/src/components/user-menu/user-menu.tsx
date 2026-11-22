import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import type { SignedOutDetail } from "../../identity/event-details";
import { AnnouncementView } from "../../identity/feedback-view";
import type { Announcement } from "../../identity/form-feedback";
import type { IdentityStateView, UserMenuClient } from "../../identity/identity-types";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { restoreOnce } from "../../identity/restore-once";
import { StateBinding } from "../../identity/state-binding";
import type { MenuSelectDetail } from "../menu-item/menu-item-options";
import { USER_MENU_LABELS, type UserMenuLabels } from "./user-menu-labels";

/** The value of the built-in sign-out item; an item of the page's own must not use it. */
const SIGN_OUT = "idg-sign-out";

type Notice = "signed-out" | "superseded" | "server-unreachable" | "error";

/**
 * The signed-in user's menu, for the identity client it is given in `client`: an avatar button
 * that opens an `idg-menu` with the user's name, the page's own items and "Sign out". It tells the
 * user how the sign-out went: a server that could not be reached is said plainly, since the
 * session may live on there, and a sign-out another tab's newer sign-in superseded is no error.
 * It goes away when the client hears that another tab signed out.
 *
 * @slot items - `idg-menu-item` elements of the page's own, such as a link to the profile. Their
 *   choice reaches the page as the menu's `idgSelect`.
 * @slot signed-out - What is shown while nobody is signed in, such as a link to sign in.
 * @part trigger - The avatar button.
 * @part outcome - A sign-out that could not reach the server, or failed.
 */
@Component({
  tag: "idg-user-menu",
  styleUrls: ["../../styles/visually-hidden.css", "user-menu.css"],
  shadow: true,
})
export class IdgUserMenu {
  @Element() host!: HTMLElement;

  /** The identity client (a JavaScript property). The element never creates one. */
  @Prop() client?: UserMenuClient;

  /** The name to show; the username by default. */
  @Prop() displayName?: string;

  /** A picture of the user for the avatar, such as their profile's; initials without one. */
  @Prop() avatarSrc?: string;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<UserMenuLabels>;

  /** Fires after "Sign out", with how it went. Navigating on is the page's job. */
  @Event() idgSignedOut!: EventEmitter<SignedOutDetail>;

  @State() private state: IdentityStateView = { status: "unknown" };
  @State() private signingOut = false;
  @State() private notice?: Notice;
  @State() private announcement: Announcement = { text: "", slot: 0 };

  private readonly binding = new StateBinding<UserMenuClient>((state, client) => {
    if (state.status === "unknown") void restoreOnce(client);
    this.state = state;
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
    this.signingOut = false;
    this.notice = undefined;
    this.bind();
  }

  private bind(): void {
    this.binding.bind(this.client);
    if (this.binding.current() === undefined) this.state = { status: "unknown" };
  }

  private text(): UserMenuLabels {
    return mergeLabels(USER_MENU_LABELS, this.labels);
  }

  private handleSelect = (event: CustomEvent<MenuSelectDetail>): void => {
    if (event.detail.value !== SIGN_OUT) return;
    event.stopPropagation();
    void this.signOut();
  };

  private async signOut(): Promise<void> {
    const client = this.binding.current();
    if (this.signingOut || !client) return;
    this.signingOut = true;
    this.notice = undefined;
    const labels = this.text();
    try {
      const { outcome } = await client.signOut();
      if (client !== this.binding.current()) return;
      this.notice = outcome;
      if (outcome !== "server-unreachable") {
        this.announce(outcome === "superseded" ? labels.superseded : labels.signedOut);
      }
      this.idgSignedOut.emit({ outcome });
    } catch {
      if (client === this.binding.current()) this.notice = "error";
    } finally {
      if (client === this.binding.current()) this.signingOut = false;
    }
  }

  private announce(text: string): void {
    this.announcement = { text, slot: this.announcement.slot === 0 ? 1 : 0 };
  }

  private dismissNotice = (event: CustomEvent<void>): void => {
    event.preventDefault();
    this.notice = undefined;
  };

  private renderMenu(name: string, labels: UserMenuLabels) {
    return (
      <idg-menu placement="bottom-end" onIdgSelect={this.handleSelect}>
        <idg-button
          slot="trigger"
          class="trigger"
          part="trigger"
          variant="ghost"
          loading={this.signingOut}
        >
          <idg-avatar name={name} src={this.avatarSrc} alt="" size="sm" />
          <span class="visually-hidden">{fillTemplate(labels.trigger, { name })}</span>
        </idg-button>
        <idg-menu-group label={fillTemplate(labels.signedInAs, { name })}>
          <slot name="items" />
        </idg-menu-group>
        <idg-menu-separator />
        <idg-menu-item value={SIGN_OUT}>{labels.signOut}</idg-menu-item>
      </idg-menu>
    );
  }

  private renderNotice(labels: UserMenuLabels) {
    if (this.notice !== "server-unreachable" && this.notice !== "error") return null;
    return (
      <idg-alert
        class="outcome"
        part="outcome"
        variant="warning"
        dismissible
        dismissLabel={labels.dismiss}
        onIdgDismiss={this.dismissNotice}
      >
        {this.notice === "error" ? labels.errorUnknown : labels.serverUnreachable}
      </idg-alert>
    );
  }

  render() {
    const labels = this.text();
    const state = this.state;
    const displayName = this.displayName?.trim() ?? "";
    let content = null;
    if (state.status === "signed-in") {
      content = this.renderMenu(displayName === "" ? state.user.username : displayName, labels);
    } else if (state.status === "signed-out") {
      content = <slot name="signed-out" />;
    }
    return (
      <div class="user-menu">
        {content}
        {this.renderNotice(labels)}
        <AnnouncementView announcement={this.announcement} />
      </div>
    );
  }
}
