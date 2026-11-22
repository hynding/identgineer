import { Component, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import { userDetail, type SignedInDetail } from "../../identity/event-details";
import { AnnouncementView, SummaryView } from "../../identity/feedback-view";
import {
  clearControls,
  focusFirstInvalid,
  rawValue,
  containInnerEvents,
  trimmedValue,
  type ValueControl,
} from "../../identity/form-controls";
import { FormFeedback } from "../../identity/form-feedback";
import { readIdentityError } from "../../identity/identity-error";
import type { SignInClient } from "../../identity/identity-types";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { assignLocation } from "../../identity/navigation";
import { systemTimers, type CountdownClock } from "../../identity/throttle-countdown";
import { SIGN_IN_LABELS, type SignInLabels } from "./sign-in-labels";
import type { ProviderSignInDetail, SignInProvider } from "./sign-in-types";

type Field = "identifier" | "password";

// Set from JavaScript, so it may be anything.
function listOf(value: unknown): readonly SignInProvider[] {
  return Array.isArray(value)
    ? value.filter(
        (entry: unknown): entry is SignInProvider =>
          typeof (entry as Partial<SignInProvider> | null)?.name === "string" &&
          typeof (entry as Partial<SignInProvider>).label === "string",
      )
    : [];
}

function isSignInClient(value: unknown): value is SignInClient {
  return typeof (value as Partial<SignInClient> | undefined)?.signIn === "function";
}

/**
 * A sign-in form for the identity client it is given in `client`. It holds no token and keeps no
 * password: the password is read from its input when the form is sent and the input is emptied
 * after a sign-in, a refused one, or when the element leaves the page.
 *
 * @slot reset - A link to reset a forgotten password, shown under the password.
 * @slot register - A link to create an account, shown at the end.
 * @part form - The form.
 * @part error - The summary of a failed attempt (`role="alert"`).
 * @part throttle - The countdown while attempts are refused.
 * @part providers - The provider buttons and their heading.
 */
@Component({
  tag: "idg-sign-in",
  styleUrls: ["../../styles/visually-hidden.css", "../../styles/identity-form.css"],
  shadow: true,
})
export class IdgSignIn {
  /** The identity client (a JavaScript property). The element never creates one. */
  @Prop() client?: SignInClient;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<SignInLabels>;

  /** Provider buttons, in order. Each starts the provider's sign-in through the client. */
  @Prop() providers?: readonly SignInProvider[];

  /** The page the CMS sends the browser back to after a provider sign-in. */
  @Prop() providerCallback?: string;

  /** Timers for the throttle countdown; the browser's by default. For tests. */
  @Prop() clock?: CountdownClock;

  /** Fires after a sign-in, with the user's id and username. Navigating on is the page's job. */
  @Event() idgSignedIn!: EventEmitter<SignedInDetail>;

  /**
   * Fires before going to a provider's sign-in. Cancel it to navigate yourself; otherwise the
   * browser goes to `detail.url` with `location.assign`.
   */
  @Event({ cancelable: true }) idgProviderSignIn!: EventEmitter<ProviderSignInDetail>;

  @State() private pending = false;
  // Bumped whenever the feedback changes, so the element draws it again.
  @State() private version = 0;

  private readonly feedback = new FormFeedback(() => {
    this.version += 1;
  });
  private readonly controls: Partial<Record<Field, ValueControl>> = {};
  private attempt = 0;
  private focusInvalid = false;

  @Watch("client")
  clientChanged(): void {
    // A sign-in still under way belongs to the old client: its answer is dropped.
    this.attempt += 1;
    this.pending = false;
    this.feedback.reset();
  }

  disconnectedCallback(): void {
    this.attempt += 1;
    this.pending = false;
    this.feedback.reset();
    clearControls([this.controls.password]);
  }

  componentDidRender(): void {
    if (!this.focusInvalid) return;
    this.focusInvalid = false;
    focusFirstInvalid(
      [
        ["identifier", this.controls.identifier],
        ["password", this.controls.password],
      ],
      this.feedback.fieldErrors,
    );
  }

  private text(): SignInLabels {
    return mergeLabels(SIGN_IN_LABELS, this.labels);
  }

  private handleSubmit = (event: globalThis.Event): void => {
    event.preventDefault();
    void this.submit();
  };

  private retry = (): void => {
    void this.submit();
  };

  private async submit(): Promise<void> {
    if (this.pending) return;
    const labels = this.text();
    const identifier = trimmedValue(this.controls.identifier);
    const missing: Partial<Record<Field, string>> = {};
    if (identifier === "") missing.identifier = labels.identifierRequired;
    if (rawValue(this.controls.password) === "") missing.password = labels.passwordRequired;
    if (Object.keys(missing).length > 0) {
      this.feedback.markFields(missing);
      this.focusInvalid = true;
      return;
    }
    const client = this.client;
    if (!isSignInClient(client)) {
      this.feedback.fail({ code: "unknown", fields: [] }, undefined, this.timers(), labels);
      return;
    }
    const attempt = (this.attempt += 1);
    this.pending = true;
    this.feedback.clear();
    try {
      const user = await client.signIn({ identifier, password: rawValue(this.controls.password) });
      if (attempt !== this.attempt) return;
      clearControls([this.controls.password]);
      this.feedback.announce(labels.signedIn);
      this.idgSignedIn.emit(userDetail(user));
    } catch (error) {
      if (attempt !== this.attempt) return;
      const failure = readIdentityError(error);
      // A refused password is gone; one that never reached the server is kept for the retry.
      if (failure.code === "invalid-credentials") clearControls([this.controls.password]);
      this.feedback.fail(failure, client, this.timers(), labels);
    } finally {
      if (attempt === this.attempt) this.pending = false;
    }
  }

  private timers(): CountdownClock {
    return this.clock ?? systemTimers;
  }

  private startProvider(provider: SignInProvider): void {
    const labels = this.text();
    const client = this.client;
    let url: string;
    try {
      if (!isSignInClient(client)) throw new Error("no client");
      const callback = this.providerCallback;
      url = client.providerSignInUrl(
        provider.name,
        callback === undefined || callback === "" ? undefined : { callback },
      );
    } catch {
      this.feedback.fail({ code: "unknown", fields: [] }, undefined, this.timers(), labels);
      return;
    }
    const event = this.idgProviderSignIn.emit({ provider: provider.name, url });
    if (!event.defaultPrevented) assignLocation(url);
  }

  private renderProviders(labels: SignInLabels) {
    const providers = listOf(this.providers);
    if (providers.length === 0) return null;
    return (
      <div class="providers" part="providers" role="group" aria-labelledby="providers-heading">
        <p class="providers-heading" id="providers-heading">
          {labels.providersHeading}
        </p>
        {providers.map((provider) => (
          <idg-button
            variant="secondary"
            full-width
            onClick={() => {
              this.startProvider(provider);
            }}
          >
            {fillTemplate(labels.provider, { provider: provider.label })}
          </idg-button>
        ))}
      </div>
    );
  }

  render() {
    const labels = this.text();
    const feedback = this.feedback;
    const errors = feedback.fieldErrors;
    return (
      <div class="identity">
        <form
          class="form"
          part="form"
          noValidate
          onSubmit={this.handleSubmit}
          ref={containInnerEvents}
        >
          <SummaryView
            feedback={feedback}
            labels={labels}
            messages={{
              "invalid-credentials": labels.errorInvalidCredentials,
              "email-not-confirmed": labels.errorEmailNotConfirmed,
            }}
            onRetry={this.retry}
          />
          <idg-field label={labels.identifier} error={errors.identifier} required>
            <idg-input
              name="identifier"
              type="text"
              autocomplete="username webauthn"
              autocapitalize="none"
              spellcheck="false"
              inputmode="email"
              required
              ref={(element) => (this.controls.identifier = element)}
            />
          </idg-field>
          <idg-field label={labels.password} error={errors.password} required>
            <idg-input
              name="password"
              type="password"
              autocomplete="current-password"
              autocapitalize="none"
              spellcheck="false"
              required
              reveal
              revealLabel={labels.showPassword}
              ref={(element) => (this.controls.password = element)}
            />
          </idg-field>
          <slot name="reset" />
          <idg-button class="submit" type="submit" full-width loading={this.pending}>
            {labels.submit}
          </idg-button>
          {this.renderProviders(labels)}
          <slot name="register" />
          <AnnouncementView announcement={feedback.announcement} />
        </form>
      </div>
    );
  }
}
