import { h, type FunctionalComponent } from "@stencil/core";
import type { ContentsEntry } from "../content/headings";

interface ContentsNavProps {
  readonly entries: readonly ContentsEntry[];
  /** Beside the article, for the layouts that draw no aside; otherwise the shell's aside. */
  readonly inline: boolean;
}

/**
 * A page's table of contents, drawn twice: in the shell's aside, where the home page has its own,
 * and beside the article for the layouts that draw no aside (centered, side-rail and split-hero).
 * The stylesheet shows one of the two in each layout.
 */
export const ContentsNav: FunctionalComponent<ContentsNavProps> = ({ entries, inline }) => {
  if (entries.length === 0) return null;
  const list = (
    <ul>
      {entries.map((entry) => (
        <li>
          <a href={`#${entry.id}`}>{entry.text}</a>
          {entry.children.length === 0 ? null : (
            <ul>
              {entry.children.map((child) => (
                <li>
                  <a href={`#${child.id}`}>{child.text}</a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
  return inline ? (
    <nav class="contents contents-inline" aria-label="On this page">
      <h2>On this page</h2>
      {list}
    </nav>
  ) : (
    <nav slot="aside" class="contents on-this-page" aria-labelledby="contents-title">
      <h2 id="contents-title">On this page</h2>
      {list}
    </nav>
  );
};
