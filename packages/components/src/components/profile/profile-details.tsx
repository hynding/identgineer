import { h } from "@stencil/core";
import { Attempts } from "../../identity/attempts";
import { SummaryView } from "../../identity/feedback-view";
import {
  containInnerEvents,
  focusFirstInvalid,
  trimmedValue,
  type ValueControl,
} from "../../identity/form-controls";
import { FormFeedback } from "../../identity/form-feedback";
import { readIdentityError } from "../../identity/identity-error";
import type { IdentityUserView, ProfileView } from "../../identity/identity-types";
import type { ProfileLabels } from "./profile-labels";
import type { LoadState, SectionHost } from "./profile-section";
import type { ProfileSavedDetail } from "./profile-types";
import { profileDetail, profileInput, timeZoneOptions } from "./profile-values";

type DetailsField = "displayName" | "bio" | "locale" | "timezone" | "marketingOptIn";

const FIELDS: readonly DetailsField[] = [
  "displayName",
  "bio",
  "locale",
  "timezone",
  "marketingOptIn",
];

interface Toggle {
  checked: boolean;
  setFocus?: () => Promise<void>;
}

/** The owner's `Profile`: read once signed in, and saved with fixed messages per field. */
export class DetailsSection {
  readonly feedback: FormFeedback;
  pending = false;
  load: LoadState = "loading";
  profile: ProfileView | null = null;
  /** New for every save, so the confirmation is drawn and announced afresh. */
  savedKey = 0;

  private readonly attempts = new Attempts();
  private readonly loads = new Attempts();
  private readonly controls: Partial<
    Record<Exclude<DetailsField, "marketingOptIn">, ValueControl>
  > = {};
  private optIn?: Toggle;
  private focusInvalid = false;

  constructor(
    private readonly host: SectionHost,
    private readonly saved: (detail: ProfileSavedDetail) => void,
  ) {
    this.feedback = new FormFeedback(host.changed);
  }

  async fetch(): Promise<void> {
    const client = this.host.client();
    if (!client) return;
    const load = this.loads.start();
    this.load = "loading";
    this.host.changed();
    try {
      const profile = await client.getProfile();
      if (!this.loads.isCurrent(load)) return;
      this.profile = profile;
      this.load = "ready";
    } catch (error) {
      if (!this.loads.isCurrent(load)) return;
      this.load = readIdentityError(error).code === "network" ? "network" : "failed";
    }
    this.host.changed();
  }

  reset(): void {
    this.attempts.cancel();
    this.loads.cancel();
    this.pending = false;
    this.load = "loading";
    this.profile = null;
    this.savedKey = 0;
    this.feedback.reset();
  }

  afterRender(): void {
    if (!this.focusInvalid) return;
    this.focusInvalid = false;
    focusFirstInvalid(
      FIELDS.map((field) => [
        field,
        field === "marketingOptIn" ? this.optIn : this.controls[field],
      ]),
      this.feedback.fieldErrors,
    );
  }

  private handleSubmit = (event: Event): void => {
    event.preventDefault();
    void this.save();
  };

  private retry = (): void => {
    void this.save();
  };

  private retryLoad = (): void => {
    void this.fetch();
  };

  private async save(): Promise<void> {
    const client = this.host.client();
    if (this.pending || !client) return;
    const labels = this.host.labels();
    const displayName = trimmedValue(this.controls.displayName);
    if (displayName === "") {
      this.feedback.markFields({ displayName: labels.displayNameRequired });
      this.focusInvalid = true;
      return;
    }
    const attempt = this.attempts.start();
    this.pending = true;
    this.savedKey = 0;
    this.feedback.clear();
    try {
      const profile = await client.saveProfile(
        profileInput({
          displayName,
          bio: trimmedValue(this.controls.bio),
          locale: trimmedValue(this.controls.locale),
          timezone: trimmedValue(this.controls.timezone),
          marketingOptIn: this.optIn?.checked ?? false,
        }),
      );
      if (!this.attempts.isCurrent(attempt)) return;
      this.profile = profile;
      this.savedKey = attempt;
      this.saved({ profile: profileDetail(profile) });
    } catch (error) {
      if (!this.attempts.isCurrent(attempt)) return;
      this.fail(readIdentityError(error), labels);
    } finally {
      if (this.attempts.isCurrent(attempt)) this.pending = false;
      this.host.changed();
    }
  }

  private fail(failure: ReturnType<typeof readIdentityError>, labels: ProfileLabels): void {
    const messages: Record<DetailsField, string> = {
      displayName: labels.displayNameInvalid,
      bio: labels.bioInvalid,
      locale: labels.localeInvalid,
      timezone: labels.timezoneInvalid,
      marketingOptIn: labels.errorValidation,
    };
    const named = FIELDS.filter((field) => failure.fields.includes(field));
    if (failure.code === "validation" && named.length > 0) {
      this.feedback.markFields(Object.fromEntries(named.map((field) => [field, messages[field]])));
      this.focusInvalid = true;
      return;
    }
    this.feedback.fail(failure, this.host.client(), this.host.timers(), labels);
  }

  render(user: IdentityUserView, labels: ProfileLabels) {
    if (this.load === "loading") return <idg-skeleton class="placeholder" lines={4} />;
    if (this.load !== "ready") {
      const network = this.load === "network";
      return (
        <idg-alert class="feedback" part="error" variant="danger">
          <span class="feedback-message">
            {network ? labels.errorNetwork : labels.errorUnknown}
          </span>
          {network ? (
            <idg-button class="retry" variant="secondary" size="sm" onClick={this.retryLoad}>
              {labels.retry}
            </idg-button>
          ) : null}
        </idg-alert>
      );
    }
    const profile = this.profile;
    const errors = this.feedback.fieldErrors;
    return (
      <form
        class="form"
        part="details"
        noValidate
        aria-labelledby="details-heading"
        onSubmit={this.handleSubmit}
        ref={containInnerEvents}
      >
        <SummaryView feedback={this.feedback} labels={labels} onRetry={this.retry} />
        <idg-field label={labels.displayName} error={errors.displayName} required>
          <idg-input
            name="displayName"
            type="text"
            autocomplete="nickname"
            maxlength={80}
            required
            value={profile?.displayName ?? user.username}
            ref={(element) => (this.controls.displayName = element)}
          />
        </idg-field>
        <idg-field label={labels.bio} error={errors.bio}>
          <idg-textarea
            name="bio"
            maxlength={500}
            counter
            value={profile?.bio ?? ""}
            ref={(element) => (this.controls.bio = element)}
          />
        </idg-field>
        <idg-field label={labels.locale} hint={labels.localeHint} error={errors.locale}>
          <idg-input
            name="locale"
            type="text"
            autocomplete="language"
            autocapitalize="none"
            spellcheck="false"
            value={profile?.locale ?? ""}
            ref={(element) => (this.controls.locale = element)}
          />
        </idg-field>
        <idg-field label={labels.timezone} error={errors.timezone}>
          <idg-select
            name="timezone"
            value={profile?.timezone ?? ""}
            ref={(element) => (this.controls.timezone = element)}
          >
            <option value="">{labels.timezoneNone}</option>
            {timeZoneOptions(profile?.timezone).map((zone) => (
              <option value={zone}>{zone}</option>
            ))}
          </idg-select>
        </idg-field>
        <idg-switch
          name="marketingOptIn"
          checked={profile?.marketingOptIn ?? false}
          ref={(element) => (this.optIn = element)}
        >
          {labels.marketingOptIn}
        </idg-switch>
        {this.savedKey > 0 ? (
          <idg-alert key={this.savedKey} part="details-saved" variant="success">
            {labels.profileSaved}
          </idg-alert>
        ) : null}
        <idg-button class="submit" type="submit" loading={this.pending}>
          {labels.saveProfile}
        </idg-button>
      </form>
    );
  }
}
