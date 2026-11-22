import { Component, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import { Attempts } from "../../identity/attempts";
import { ByteCountView } from "../../identity/byte-count-view";
import { userDetail } from "../../identity/event-details";
import { AnnouncementView, SummaryView } from "../../identity/feedback-view";
import {
  clearControls,
  containInnerEvents,
  focusFirstInvalid,
  rawValue,
  trimmedValue,
  type ValueControl,
} from "../../identity/form-controls";
import { FormFeedback } from "../../identity/form-feedback";
import { readIdentityError } from "../../identity/identity-error";
import type { RegisterClient } from "../../identity/identity-types";
import { mergeLabels } from "../../identity/labels";
import { markPasswordLength } from "../../identity/new-password";
import { MAX_PASSWORD_BYTES, utf8ByteLength } from "../../identity/password-bytes";
import { systemTimers, type CountdownClock } from "../../identity/throttle-countdown";
import type { ValueDetail } from "../../utils/event-details";
import { REGISTER_LABELS, type RegisterLabels } from "./register-labels";
import type { RegisteredDetail } from "./register-types";

type Field = "username" | "email" | "password";

const FIELDS: readonly Field[] = ["username", "email", "password"];

function isRegisterClient(value: unknown): value is RegisterClient {
  return typeof (value as Partial<RegisterClient> | undefined)?.register === "function";
}

/**
 * A registration form for the identity client it is given in `client`. With email confirmation on,
 * a new address and one already registered get the same answer, so the form never tells whether
 * an account exists. The password is read from its input when the form is sent and the input is
 * emptied after every attempt.
 *
 * @slot sign-in - A link to sign in instead, shown at the end.
 * @part form - The form.
 * @part error - The summary of a failed attempt (`role="alert"`).
 * @part throttle - The countdown while attempts are refused.
 * @part byte-count - How many of the password's 72 bytes are used.
 * @part confirmation - What is shown in the form's place once it is sent.
 */
@Component({
  tag: "idg-register",
  styleUrls: ["../../styles/visually-hidden.css", "../../styles/identity-form.css"],
  shadow: true,
})
export class IdgRegister {
  /** The identity client (a JavaScript property). The element never creates one. */
  @Prop() client?: RegisterClient;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<RegisterLabels>;

  /** Timers for the throttle countdown; the browser's by default. For tests. */
  @Prop() clock?: CountdownClock;

  /** Fires once the account is asked for. Navigating on is the page's job. */
  @Event() idgRegistered!: EventEmitter<RegisteredDetail>;

  @State() private pending = false;
  @State() private passwordBytes = 0;
  @State() private outcome?: RegisteredDetail["outcome"];
  // Bumped whenever the feedback changes, so the element draws it again.
  @State() private version = 0;

  private readonly feedback = new FormFeedback(() => {
    this.version += 1;
  });
  private readonly attempts = new Attempts();
  private readonly controls: Partial<Record<Field, ValueControl>> = {};
  private confirmation?: HTMLElement;
  private focusInvalid = false;
  private focusConfirmation = false;

  @Watch("client")
  clientChanged(): void {
    this.attempts.cancel();
    this.pending = false;
    this.feedback.reset();
  }

  disconnectedCallback(): void {
    this.attempts.cancel();
    this.pending = false;
    this.feedback.reset();
    this.clearPassword();
  }

  componentDidRender(): void {
    if (this.focusConfirmation) {
      this.focusConfirmation = false;
      this.confirmation?.focus();
    }
    if (this.focusInvalid) {
      this.focusInvalid = false;
      focusFirstInvalid(
        FIELDS.map((field) => [field, this.controls[field]] as const),
        this.feedback.fieldErrors,
      );
    }
  }

  private text(): RegisterLabels {
    return mergeLabels(REGISTER_LABELS, this.labels);
  }

  private clearPassword(): void {
    clearControls([this.controls.password]);
    this.passwordBytes = 0;
  }

  private handlePasswordInput = (event: CustomEvent<ValueDetail>): void => {
    this.passwordBytes = utf8ByteLength(event.detail.value);
    markPasswordLength(this.feedback, "password", this.passwordBytes, this.text().passwordTooLong);
  };

  private handleSubmit = (event: globalThis.Event): void => {
    event.preventDefault();
    void this.submit();
  };

  private retry = (): void => {
    void this.submit();
  };

  private checkInput(
    labels: RegisterLabels,
    username: string,
    email: string,
  ): Partial<Record<Field, string>> {
    const errors: Partial<Record<Field, string>> = {};
    if (username === "") errors.username = labels.usernameRequired;
    if (email === "") errors.email = labels.emailRequired;
    const password = rawValue(this.controls.password);
    if (password === "") errors.password = labels.passwordRequired;
    else if (utf8ByteLength(password) > MAX_PASSWORD_BYTES)
      errors.password = labels.passwordTooLong;
    return errors;
  }

  private async submit(): Promise<void> {
    if (this.pending) return;
    const labels = this.text();
    const username = trimmedValue(this.controls.username);
    const email = trimmedValue(this.controls.email);
    const errors = this.checkInput(labels, username, email);
    if (Object.keys(errors).length > 0) {
      this.feedback.markFields(errors);
      this.focusInvalid = true;
      return;
    }
    const client = this.client;
    if (!isRegisterClient(client)) {
      this.feedback.fail({ code: "unknown", fields: [] }, undefined, this.timers(), labels);
      return;
    }
    const attempt = this.attempts.start();
    this.pending = true;
    this.feedback.clear();
    const password = rawValue(this.controls.password);
    try {
      const result = await client.register({ username, email, password });
      if (!this.attempts.isCurrent(attempt)) return;
      this.clearPassword();
      this.outcome = result.outcome;
      this.focusConfirmation = true;
      this.idgRegistered.emit(
        result.outcome === "signed-in"
          ? { outcome: "signed-in", ...userDetail(result.user) }
          : { outcome: "check-email" },
      );
    } catch (error) {
      if (!this.attempts.isCurrent(attempt)) return;
      this.clearPassword();
      this.fail(readIdentityError(error), client, labels);
    } finally {
      if (this.attempts.isCurrent(attempt)) this.pending = false;
    }
  }

  private fail(
    failure: ReturnType<typeof readIdentityError>,
    client: RegisterClient,
    labels: RegisterLabels,
  ): void {
    const named = FIELDS.filter((field) => failure.fields.includes(field));
    if (failure.code === "validation" && named.length > 0) {
      const messages: Record<Field, string> = {
        username: labels.usernameInvalid,
        email: labels.emailInvalid,
        password: labels.passwordInvalid,
      };
      this.feedback.markFields(Object.fromEntries(named.map((field) => [field, messages[field]])));
      this.focusInvalid = true;
      return;
    }
    this.feedback.fail(failure, client, this.timers(), labels);
  }

  private timers(): CountdownClock {
    return this.clock ?? systemTimers;
  }

  private renderConfirmation(labels: RegisterLabels) {
    return (
      <div
        class="confirmation"
        part="confirmation"
        tabindex="-1"
        ref={(element) => (this.confirmation = element)}
      >
        <idg-alert variant="success">
          {this.outcome === "signed-in" ? labels.signedIn : labels.checkEmail}
        </idg-alert>
      </div>
    );
  }

  render() {
    const labels = this.text();
    if (this.outcome !== undefined) {
      return <div class="identity">{this.renderConfirmation(labels)}</div>;
    }
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
          <SummaryView feedback={feedback} labels={labels} onRetry={this.retry} />
          <idg-field label={labels.username} error={errors.username} required>
            <idg-input
              name="username"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
              ref={(element) => (this.controls.username = element)}
            />
          </idg-field>
          <idg-field label={labels.email} error={errors.email} required>
            <idg-input
              name="email"
              type="email"
              autocomplete="email"
              autocapitalize="none"
              spellcheck="false"
              required
              ref={(element) => (this.controls.email = element)}
            />
          </idg-field>
          <idg-field label={labels.password} error={errors.password} required>
            <idg-input
              name="password"
              type="password"
              autocomplete="new-password"
              autocapitalize="none"
              spellcheck="false"
              required
              reveal
              revealLabel={labels.showPassword}
              onIdgInput={this.handlePasswordInput}
              ref={(element) => (this.controls.password = element)}
            />
          </idg-field>
          <ByteCountView used={this.passwordBytes} template={labels.passwordBytes} />
          <idg-button class="submit" type="submit" full-width loading={this.pending}>
            {labels.submit}
          </idg-button>
          <slot name="sign-in" />
          <AnnouncementView announcement={feedback.announcement} />
        </form>
      </div>
    );
  }
}
