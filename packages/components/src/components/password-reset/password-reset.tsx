import { Component, Event, h, Prop, State, Watch, type EventEmitter } from "@stencil/core";
import { Attempts } from "../../identity/attempts";
import { ByteCountView } from "../../identity/byte-count-view";
import { userDetail, type SignedInDetail } from "../../identity/event-details";
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
import {
  keepsPasswordForRetry,
  readIdentityError,
  type IdentityFailure,
} from "../../identity/identity-error";
import type { PasswordResetClient } from "../../identity/identity-types";
import { mergeLabels } from "../../identity/labels";
import { markPasswordLength, newPasswordErrors } from "../../identity/new-password";
import { utf8ByteLength } from "../../identity/password-bytes";
import { systemTimers, type CountdownClock } from "../../identity/throttle-countdown";
import { oneOf } from "../../utils/choice";
import type { ValueDetail } from "../../utils/event-details";
import { PASSWORD_RESET_LABELS, type PasswordResetLabels } from "./password-reset-labels";
import { PASSWORD_RESET_MODES, type PasswordResetMode } from "./password-reset-options";

type Field = "email" | "code" | "password" | "passwordConfirmation";

const FIELDS: readonly Field[] = ["email", "code", "password", "passwordConfirmation"];

function isResetClient(value: unknown): value is PasswordResetClient {
  return (
    typeof (value as Partial<PasswordResetClient> | undefined)?.requestPasswordReset === "function"
  );
}

/**
 * Password recovery for the identity client it is given in `client`, in two modes. `request` asks
 * for the address and always answers the same, whether or not an account uses it. `complete`
 * sets the new password with the emailed code, which the page reads from the link and passes in
 * `code`, and signs in. The passwords are read from their inputs when the form is sent and the
 * inputs are emptied after every attempt.
 *
 * @slot request - In `complete` mode, a link to ask for a new code.
 * @slot sign-in - A link back to signing in, shown at the end.
 * @part form - The form.
 * @part error - The summary of a failed attempt (`role="alert"`).
 * @part throttle - The countdown while attempts are refused.
 * @part byte-count - How many of the new password's 72 bytes are used.
 * @part confirmation - What is shown in the form's place once it is sent.
 */
@Component({
  tag: "idg-password-reset",
  styleUrls: ["../../styles/visually-hidden.css", "../../styles/identity-form.css"],
  shadow: true,
})
export class IdgPasswordReset {
  /** The identity client (a JavaScript property). The element never creates one. */
  @Prop() client?: PasswordResetClient;

  /** Which step to show. Unknown values fall back to `request`. */
  @Prop({ reflect: true }) mode: PasswordResetMode = "request";

  /**
   * The code from the reset email, which the page reads from the link it was sent. Without one,
   * `complete` mode asks for it.
   */
  @Prop() code?: string;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<PasswordResetLabels>;

  /** Timers for the throttle countdown; the browser's by default. For tests. */
  @Prop() clock?: CountdownClock;

  /** Fires once a reset email is asked for. It carries nothing: the answer is the same for all. */
  @Event() idgResetRequested!: EventEmitter<void>;

  /** Fires once the new password is set and the user signed in, with their id and username. */
  @Event() idgPasswordReset!: EventEmitter<SignedInDetail>;

  @State() private pending = false;
  @State() private done = false;
  @State() private passwordBytes = 0;
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
  @Watch("mode")
  @Watch("code")
  restart(): void {
    this.attempts.cancel();
    this.pending = false;
    this.done = false;
    this.feedback.reset();
    this.clearPasswords();
  }

  disconnectedCallback(): void {
    this.attempts.cancel();
    this.pending = false;
    this.feedback.reset();
    this.clearPasswords();
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

  private text(): PasswordResetLabels {
    return mergeLabels(PASSWORD_RESET_LABELS, this.labels);
  }

  private currentMode(): PasswordResetMode {
    return oneOf(PASSWORD_RESET_MODES, this.mode, "request");
  }

  private givenCode(): string {
    return typeof this.code === "string" ? this.code.trim() : "";
  }

  private clearPasswords(): void {
    clearControls([this.controls.password, this.controls.passwordConfirmation]);
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

  private async submit(): Promise<void> {
    if (this.pending) return;
    const labels = this.text();
    const request = this.currentMode() === "request";
    const errors = request ? this.requestErrors(labels) : this.completeErrors(labels);
    if (Object.keys(errors).length > 0) {
      this.feedback.markFields(errors);
      this.focusInvalid = true;
      return;
    }
    const client = this.client;
    if (!isResetClient(client)) {
      this.feedback.fail({ code: "unknown", fields: [] }, undefined, this.timers(), labels);
      return;
    }
    const attempt = this.attempts.start();
    this.pending = true;
    this.feedback.clear();
    try {
      if (request) {
        await client.requestPasswordReset({ email: trimmedValue(this.controls.email) });
        if (!this.attempts.isCurrent(attempt)) return;
        this.finish();
        this.idgResetRequested.emit();
      } else {
        const user = await client.resetPassword({
          code: this.givenCode() || trimmedValue(this.controls.code),
          password: rawValue(this.controls.password),
          passwordConfirmation: rawValue(this.controls.passwordConfirmation),
        });
        if (!this.attempts.isCurrent(attempt)) return;
        this.finish();
        this.idgPasswordReset.emit(userDetail(user));
      }
    } catch (error) {
      if (!this.attempts.isCurrent(attempt)) return;
      const failure = readIdentityError(error);
      if (!keepsPasswordForRetry(failure)) this.clearPasswords();
      this.fail(failure, client, labels, request);
    } finally {
      if (this.attempts.isCurrent(attempt)) this.pending = false;
    }
  }

  private requestErrors(labels: PasswordResetLabels): Partial<Record<Field, string>> {
    return trimmedValue(this.controls.email) === "" ? { email: labels.emailRequired } : {};
  }

  private completeErrors(labels: PasswordResetLabels): Partial<Record<Field, string>> {
    const codeMissing = this.givenCode() === "" && trimmedValue(this.controls.code) === "";
    return {
      ...(codeMissing ? { code: labels.codeRequired } : {}),
      ...newPasswordErrors(
        rawValue(this.controls.password),
        rawValue(this.controls.passwordConfirmation),
        labels,
      ),
    };
  }

  private finish(): void {
    this.clearPasswords();
    this.done = true;
    this.focusConfirmation = true;
  }

  private fail(
    failure: IdentityFailure,
    client: PasswordResetClient,
    labels: PasswordResetLabels,
    request: boolean,
  ): void {
    // The address is the only input a request has, so a refused request is about it.
    if (request && failure.code === "validation") {
      this.feedback.markFields({ email: labels.emailInvalid });
      this.focusInvalid = true;
      return;
    }
    this.feedback.fail(failure, client, this.timers(), labels);
  }

  private timers(): CountdownClock {
    return this.clock ?? systemTimers;
  }

  private renderRequestFields(labels: PasswordResetLabels) {
    return (
      <idg-field label={labels.email} error={this.feedback.fieldErrors.email} required>
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
    );
  }

  private renderCompleteFields(labels: PasswordResetLabels) {
    const errors = this.feedback.fieldErrors;
    return [
      this.givenCode() === "" ? (
        <idg-field label={labels.code} error={errors.code} required>
          <idg-input
            name="code"
            type="text"
            autocomplete="one-time-code"
            autocapitalize="none"
            spellcheck="false"
            required
            ref={(element) => (this.controls.code = element)}
          />
        </idg-field>
      ) : null,
      <idg-field label={labels.newPassword} error={errors.password} required>
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
      </idg-field>,
      <ByteCountView used={this.passwordBytes} template={labels.passwordBytes} />,
      <idg-field label={labels.confirmPassword} error={errors.passwordConfirmation} required>
        <idg-input
          name="passwordConfirmation"
          type="password"
          autocomplete="new-password"
          autocapitalize="none"
          spellcheck="false"
          required
          reveal
          revealLabel={labels.showPassword}
          ref={(element) => (this.controls.passwordConfirmation = element)}
        />
      </idg-field>,
    ];
  }

  render() {
    const labels = this.text();
    const request = this.currentMode() === "request";
    if (this.done) {
      return (
        <div class="identity">
          <div
            class="confirmation"
            part="confirmation"
            tabindex="-1"
            ref={(element) => (this.confirmation = element)}
          >
            <idg-alert variant="success">
              {request ? labels.requestSent : labels.passwordReset}
            </idg-alert>
          </div>
        </div>
      );
    }
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
            feedback={this.feedback}
            labels={labels}
            messages={{ "invalid-credentials": labels.errorInvalidCode }}
            retry
          />
          {request ? this.renderRequestFields(labels) : this.renderCompleteFields(labels)}
          <idg-button class="submit" type="submit" full-width loading={this.pending}>
            {request ? labels.requestSubmit : labels.completeSubmit}
          </idg-button>
          {request ? null : <slot name="request" />}
          <slot name="sign-in" />
          <AnnouncementView announcement={this.feedback.announcement} />
        </form>
      </div>
    );
  }
}
