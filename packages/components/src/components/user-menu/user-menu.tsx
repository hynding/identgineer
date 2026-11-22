import { Component, Element, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import type { SignedOutDetail } from "../../identity/event-details";
import { AnnouncementView } from "../../identity/feedback-view";
import {
  firstAssigned,
  focusIfFocusable,
  focusWithin,
  focusWithinOrLost,
} from "../../identity/focus-region";
import type { Announcement } from "../../identity/form-feedback";
import type { IdentityStateView, UserMenuClient } from "../../identity/identity-types";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { RestoreWatch } from "../../identity/restore-watch";
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
  styleUrls: ["../../styles/focus-ring.css", "../../styles/visually-hidden.css", "user-menu.css"],
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
  /** The notice takes focus, which reads it, so it leaves out its live role to be said once. */
  @State() private noticeTakesFocus = false;

  /** What the menu's focus anchor says while it has focus; nothing otherwise. */
  @State() private anchorText = "";

  /** Set after a sign-out that took the focused trigger away, or a dismissed notice. */
  private moveFocus = false;
  /** What a sign-out that moves focus says, by focus or politely, once focus has gone. */
  private outcomeText = "";
  /** Set when the anchor is to take focus after the next render. */
  private focusAnchorNext = false;

  // A restore that could not reach the server is tried again once the browser is back online;
  // until then the menu draws nothing, since it does not know who is signed in.
  private readonly restoring = new RestoreWatch<UserMenuClient>(
    () => this.binding.current(),
    () => undefined,
  );
  private readonly binding = new StateBinding<UserMenuClient>((state, client) => {
    if (state.status === "unknown") this.restoring.start(client);
    else this.restoring.stop();
    this.state = state;
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
    this.signingOut = false;
    this.notice = undefined;
    this.restoring.stop();
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
    this.noticeTakesFocus = false;
    const labels = this.text();
    try {
      const { outcome } = await client.signOut();
      if (client !== this.binding.current()) return;
      this.moveFocus = focusWithinOrLost(this.host);
      this.notice = outcome;
      this.noticeTakesFocus = this.moveFocus;
      const text =
        outcome === "server-unreachable"
          ? ""
          : outcome === "superseded"
            ? labels.superseded
            : labels.signedOut;
      // Where focus goes decides how it is said: see componentDidRender.
      if (this.moveFocus) this.outcomeText = text;
      else if (text !== "") this.announce(text);
      this.idgSignedOut.emit({ outcome });
    } catch {
      if (client === this.binding.current()) this.notice = "error";
    } finally {
      if (client === this.binding.current()) this.signingOut = false;
    }
  }

  // To the warning when there is one; otherwise to what the page shows while signed out when that
  // takes focus as it is, with the outcome said politely; otherwise to the menu's hidden anchor,
  // which says it as it takes focus. Nothing of the page's is made focusable.
  componentDidRender(): void {
    const root = this.host.shadowRoot;
    if (this.focusAnchorNext) {
      this.focusAnchorNext = false;
      root?.querySelector<HTMLElement>(".focus-anchor")?.focus();
      return;
    }
    if (!this.moveFocus || this.state.status === "signed-in") return;
    this.moveFocus = false;
    const text = this.outcomeText;
    this.outcomeText = "";
    const notice = root?.querySelector<HTMLElement>(".notice");
    if (notice) {
      notice.focus();
      return;
    }
    if (focusIfFocusable(firstAssigned(root?.querySelector('slot[name="signed-out"]')))) {
      if (text !== "") this.announce(text);
      return;
    }
    this.anchorText = text === "" ? this.text().signedOut : text;
    this.focusAnchorNext = true;
  }

  private anchorBlurred = (): void => {
    this.anchorText = "";
  };

  private announce(text: string): void {
    this.announcement = { text, slot: this.announcement.slot === 0 ? 1 : 0 };
  }

  private dismissNotice = (event: CustomEvent<void>): void => {
    event.preventDefault();
    this.moveFocus = focusWithin(this.host);
    this.notice = undefined;
    this.noticeTakesFocus = false;
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
      <div class="notice focusable" tabindex="-1">
        <idg-alert
          class="outcome"
          part="outcome"
          variant="warning"
          quiet={this.noticeTakesFocus}
          dismissible
          dismissLabel={labels.dismiss}
          onIdgDismiss={this.dismissNotice}
        >
          {this.notice === "error" ? labels.errorUnknown : labels.serverUnreachable}
        </idg-alert>
      </div>
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
        <span class="focus-anchor visually-hidden" tabindex="-1" onBlur={this.anchorBlurred}>
          {this.anchorText}
        </span>
        {content}
        {this.renderNotice(labels)}
        <AnnouncementView announcement={this.announcement} />
      </div>
    );
  }
}
