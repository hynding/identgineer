import { h } from "@stencil/core";
import { Attempts } from "../../identity/attempts";
import { ByteCountView } from "../../identity/byte-count-view";
import { SummaryView } from "../../identity/feedback-view";
import {
  clearControls,
  containInnerEvents,
  focusFirstInvalid,
  rawValue,
  type ValueControl,
} from "../../identity/form-controls";
import { FormFeedback } from "../../identity/form-feedback";
import { keepsPasswordForRetry, readIdentityError } from "../../identity/identity-error";
import type { IdentityUserView } from "../../identity/identity-types";
import { markPasswordLength, newPasswordErrors } from "../../identity/new-password";
import { utf8ByteLength } from "../../identity/password-bytes";
import type { ValueDetail } from "../../utils/event-details";
import type { ProfileLabels } from "./profile-labels";
import type { SectionHost } from "./profile-section";

type PasswordField = "currentPassword" | "newPassword" | "passwordConfirmation";

const FIELDS: readonly PasswordField[] = ["currentPassword", "newPassword", "passwordConfirmation"];

/**
 * A password change. The account's username sits in a hidden field beside the passwords, so a
 * password manager knows which saved password to update. The passwords are read from their
 * inputs when the form is sent and emptied after it, unless the attempt never reached the server.
 */
export class PasswordSection {
  readonly feedback: FormFeedback;
  pending = false;
  passwordBytes = 0;
  /** New for every change, so the confirmation is drawn and announced afresh. */
  changedKey = 0;

  private readonly attempts = new Attempts();
  private readonly controls: Partial<Record<PasswordField, ValueControl>> = {};
  private focusInvalid = false;

  constructor(
    private readonly host: SectionHost,
    private readonly passwordChanged: () => void,
  ) {
    this.feedback = new FormFeedback(host.changed);
  }

  reset(): void {
    this.attempts.cancel();
    this.pending = false;
    this.changedKey = 0;
    this.feedback.reset();
    this.clear();
  }

  afterRender(): void {
    if (!this.focusInvalid) return;
    this.focusInvalid = false;
    focusFirstInvalid(
      FIELDS.map((field) => [field, this.controls[field]] as const),
      this.feedback.fieldErrors,
    );
  }

  private clear(): void {
    clearControls(FIELDS.map((field) => this.controls[field]));
    this.passwordBytes = 0;
  }

  private handleNewPasswordInput = (event: CustomEvent<ValueDetail>): void => {
    this.passwordBytes = utf8ByteLength(event.detail.value);
    markPasswordLength(
      this.feedback,
      "newPassword",
      this.passwordBytes,
      this.host.labels().passwordTooLong,
    );
    this.host.changed();
  };

  private handleSubmit = (event: Event): void => {
    event.preventDefault();
    void this.submit();
  };

  private retry = (): void => {
    void this.submit();
  };

  private errors(labels: ProfileLabels): Partial<Record<PasswordField, string>> {
    const current = rawValue(this.controls.currentPassword);
    const password = rawValue(this.controls.newPassword);
    const { password: newPassword, passwordConfirmation } = newPasswordErrors(
      password,
      rawValue(this.controls.passwordConfirmation),
      labels,
    );
    const unchanged = current !== "" && password === current;
    return {
      ...(current === "" ? { currentPassword: labels.currentPasswordRequired } : {}),
      ...(newPassword === undefined
        ? unchanged
          ? { newPassword: labels.passwordUnchanged }
          : {}
        : { newPassword }),
      ...(passwordConfirmation === undefined ? {} : { passwordConfirmation }),
    };
  }

  private async submit(): Promise<void> {
    const client = this.host.client();
    if (this.pending || !client) return;
    const labels = this.host.labels();
    const errors = this.errors(labels);
    if (Object.keys(errors).length > 0) {
      this.feedback.markFields(errors);
      this.focusInvalid = true;
      return;
    }
    const attempt = this.attempts.start();
    this.pending = true;
    this.changedKey = 0;
    this.feedback.clear();
    try {
      await client.changePassword({
        currentPassword: rawValue(this.controls.currentPassword),
        password: rawValue(this.controls.newPassword),
        passwordConfirmation: rawValue(this.controls.passwordConfirmation),
      });
      if (!this.attempts.isCurrent(attempt)) return;
      this.clear();
      this.changedKey = attempt;
      this.passwordChanged();
    } catch (error) {
      if (!this.attempts.isCurrent(attempt)) return;
      const failure = readIdentityError(error);
      if (!keepsPasswordForRetry(failure)) this.clear();
      this.feedback.fail(failure, client, this.host.timers(), labels);
    } finally {
      if (this.attempts.isCurrent(attempt)) this.pending = false;
      this.host.changed();
    }
  }

  render(user: IdentityUserView, labels: ProfileLabels) {
    const errors = this.feedback.fieldErrors;
    return (
      <form
        class="form"
        part="password"
        noValidate
        aria-labelledby="password-heading"
        onSubmit={this.handleSubmit}
        ref={containInnerEvents}
      >
        <SummaryView
          feedback={this.feedback}
          labels={labels}
          messages={{
            "invalid-credentials": labels.errorCurrentPassword,
            unauthorized: labels.errorUnauthorized,
          }}
          onRetry={this.retry}
        />
        <input
          type="text"
          name="username"
          autocomplete="username"
          value={user.username}
          readOnly
          hidden
        />
        <idg-field label={labels.currentPassword} error={errors.currentPassword} required>
          <idg-input
            name="currentPassword"
            type="password"
            autocomplete="current-password"
            autocapitalize="none"
            spellcheck="false"
            required
            reveal
            revealLabel={labels.showPassword}
            ref={(element) => (this.controls.currentPassword = element)}
          />
        </idg-field>
        <idg-field label={labels.newPassword} error={errors.newPassword} required>
          <idg-input
            name="newPassword"
            type="password"
            autocomplete="new-password"
            autocapitalize="none"
            spellcheck="false"
            required
            reveal
            revealLabel={labels.showPassword}
            onIdgInput={this.handleNewPasswordInput}
            ref={(element) => (this.controls.newPassword = element)}
          />
        </idg-field>
        <ByteCountView used={this.passwordBytes} template={labels.passwordBytes} />
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
        </idg-field>
        {this.changedKey > 0 ? (
          <idg-alert key={this.changedKey} part="password-saved" variant="success">
            {labels.passwordChanged}
          </idg-alert>
        ) : null}
        <idg-button class="submit" type="submit" loading={this.pending}>
          {labels.changePassword}
        </idg-button>
      </form>
    );
  }
}
