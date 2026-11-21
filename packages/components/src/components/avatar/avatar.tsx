import { Component, h, Prop, State, Watch } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { initials } from "../../utils/initials";
import { nameTone } from "../../utils/name-tone";
import { safeImageUrl } from "../../utils/safe-image-url";
import {
  AVATAR_SIZES,
  AVATAR_STATUSES,
  STATUS_LABELS,
  type AvatarSize,
  type AvatarStatus,
} from "./avatar-options";

/**
 * A person or account, as a picture or, when there is none or it fails to load, their initials on a
 * colour chosen from their name.
 *
 * @part avatar - The circle or square holding the picture or initials.
 * @part image - The picture.
 * @part status - The status dot.
 */
@Component({
  tag: "idg-avatar",
  styleUrls: ["../../styles/avatar-size.css", "avatar.css"],
  shadow: true,
})
export class IdgAvatar {
  /** The picture. Only http, https and relative urls are loaded. */
  @Prop() src?: string;

  /**
   * What the picture shows. Defaults to `name`. An empty string marks the avatar as decoration,
   * for one that sits beside the same name written out as text.
   */
  @Prop() alt?: string;

  /** The person's name: the source of the initials and the colour, and the default alt. */
  @Prop() name?: string;

  /** Avatar size. */
  @Prop({ reflect: true }) size: AvatarSize = "md";

  /** Shows a status dot. Each status has its own shape, so colour is not the only cue. */
  @Prop() status?: AvatarStatus;

  /** The status dot's accessible name. Defaults to the status in English. */
  @Prop({ attribute: "status-label" }) statusLabel?: string;

  @State() private failedSrc?: string;

  @Watch("src")
  protected srcChanged(): void {
    this.failedSrc = undefined;
  }

  private handleError = (): void => {
    this.failedSrc = this.src;
  };

  private accessibleName(): string {
    return this.alt ?? this.name ?? "";
  }

  render() {
    const size = oneOf(AVATAR_SIZES, this.size, "md");
    const status = AVATAR_STATUSES.find((candidate) => candidate === this.status);
    const src = this.failedSrc === this.src ? undefined : safeImageUrl(this.src);
    const name = this.accessibleName();
    const classes = { avatar: true, [`size-${size}`]: true };

    return [
      src === undefined ? (
        <Fallback classes={classes} name={this.name} label={name} />
      ) : (
        <span class={{ ...classes, "tone-0": true }} part="avatar">
          <img
            class="image"
            part="image"
            src={src}
            alt={name}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={this.handleError}
          />
        </span>
      ),
      status === undefined ? null : (
        <span
          class={{ status: true, [`status-${status}`]: true, [`size-${size}`]: true }}
          part="status"
          role="img"
          aria-label={
            this.statusLabel === undefined || this.statusLabel === ""
              ? STATUS_LABELS[status]
              : this.statusLabel
          }
        />
      ),
    ];
  }
}

interface FallbackProps {
  classes: Record<string, boolean>;
  name: string | undefined;
  label: string;
}

const Fallback = ({ classes, name, label }: FallbackProps) => {
  const letters = initials(name);
  const toneClass = `tone-${String(nameTone(name ?? ""))}`;
  return (
    <span
      class={{ ...classes, [toneClass]: true }}
      part="avatar"
      role={label === "" ? undefined : "img"}
      aria-label={label === "" ? undefined : label}
      aria-hidden={label === "" ? "true" : undefined}
    >
      {letters === "" ? (
        <idg-icon name="user" aria-hidden="true" />
      ) : (
        <span class="initials" aria-hidden="true">
          {letters}
        </span>
      )}
    </span>
  );
};
