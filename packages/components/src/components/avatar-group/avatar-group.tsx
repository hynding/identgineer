import { Component, Element, h, Prop, State } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { AVATAR_SIZES, type AvatarSize } from "../avatar/avatar-options";

interface GroupedAvatar extends HTMLElement {
  size: AvatarSize;
}

/**
 * Overlaps a row of idg-avatar. It sets their size, and with `max` hides the ones past the limit
 * and shows how many there are.
 *
 * @slot - The idg-avatar elements.
 * @part group - The row.
 * @part more - The count of hidden avatars.
 */
@Component({
  tag: "idg-avatar-group",
  styleUrls: ["../../styles/avatar-size.css", "avatar-group.css"],
  shadow: true,
})
export class IdgAvatarGroup {
  @Element() host!: HTMLElement;

  /** Names the group for assistive technology, such as "Reviewers". */
  @Prop() label?: string;

  /** The size of every avatar in the group. */
  @Prop({ reflect: true }) size: AvatarSize = "md";

  /** The most avatars to show. The rest are hidden and counted. */
  @Prop() max?: number;

  /** The word after the count in its accessible name, such as "2 more". */
  @Prop({ attribute: "more-label" }) moreLabel = "more";

  @State() private total = 0;

  componentWillLoad(): void {
    this.total = this.avatars().length;
  }

  componentDidRender(): void {
    const limit = this.limit();
    this.avatars().forEach((avatar, index) => {
      avatar.size = oneOf(AVATAR_SIZES, this.size, "md");
      if (index >= limit) avatar.setAttribute("hidden", "");
      else avatar.removeAttribute("hidden");
    });
  }

  private avatars(): GroupedAvatar[] {
    return Array.from(this.host.children).filter(
      (child): child is GroupedAvatar => child.tagName === "IDG-AVATAR",
    );
  }

  private limit(): number {
    const max = this.max;
    return max !== undefined && Number.isInteger(max) && max > 0 ? max : Infinity;
  }

  render() {
    const hidden = Math.max(0, this.total - this.limit());
    const size = oneOf(AVATAR_SIZES, this.size, "md");
    const label = this.label === undefined || this.label === "" ? undefined : this.label;
    return (
      <div
        class="group"
        part="group"
        role={label === undefined ? undefined : "group"}
        aria-label={label}
      >
        <slot
          onSlotchange={() => {
            this.total = this.avatars().length;
          }}
        />
        {hidden === 0 ? null : (
          <span
            class={{ more: true, [`size-${size}`]: true }}
            part="more"
            role="img"
            aria-label={`${String(hidden)} ${this.moreLabel}`}
          >
            +{hidden}
          </span>
        )}
      </div>
    );
  }
}
