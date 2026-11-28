import { Component, Prop, State, h } from "@stencil/core";
import type {
  Block,
  CodeBlock,
  CodeLanguage,
  ContentPage,
  ExampleBlock,
  ExampleName,
  Inline,
  InlineContent,
  TableBlock,
} from "../../content/content-page";
import { headingId, sectionsOf, tableOfContents, type BodySection } from "../../content/headings";
import type { ExampleNode } from "../../examples/component-example";
import { usageSnippet } from "../../examples/component-example";
import { COMPONENT_EXAMPLES, type ComponentExampleName } from "../../examples/component-examples";
import { readContentPage } from "../../content/read-content-page";
import {
  neighboursOf,
  routeOfContent,
  routeOfPath,
  sectionOf,
  type ContentRoute,
} from "../../routes";
import { DashboardFigures, SignInPreview, ThemeTiles } from "../../shell/showcase";
import { SiteShell } from "../../shell/site-shell";

const LANGUAGE_NAMES: Readonly<Record<CodeLanguage, string>> = {
  html: "HTML",
  css: "CSS",
  ts: "TypeScript",
  js: "JavaScript",
  json: "JSON",
  sh: "Shell",
  text: "Text",
};

/**
 * The live examples content can place, by name. Each is drawn from the project's own components
 * with sample data; content names one and carries none of its markup.
 */
const SHOWCASES: Readonly<Record<Exclude<ExampleName, ComponentExampleName>, () => unknown>> = {
  "sign-in": () => <SignInPreview />,
  "dashboard-figures": () => <DashboardFigures />,
  "theme-tiles": () => (
    <div class="themes-room">
      <ThemeTiles />
    </div>
  ),
};

function isComponentExample(name: ExampleName): name is ComponentExampleName {
  return Object.hasOwn(COMPONENT_EXAMPLES, name);
}

/**
 * An example's description as the element it describes. The tags and attributes come from the
 * registry, never from a page's content, and the text is a text node: nothing here reads markup.
 */
function drawExample(node: ExampleNode): unknown {
  if (typeof node === "string") return node;
  return h(node.tag, { ...node.attributes }, ...(node.children ?? []).map(drawExample));
}

/**
 * A name shorter than this fits a line of the narrowest column whole (sixteen characters of code
 * in a note at 320px), so it is never broken; a longer one may need to be.
 */
const LONG_NAME = 17;

/**
 * Where a long name may wrap: after a `_`, `/`, `.`, `=` or `-` that follows a letter or a digit,
 * or after `://`, and comes before another part (so not after a leading `?`, `/` or `--`), and
 * inside camelCase.
 */
const NAME_PARTS = /(?<=[\p{L}\p{N}][_/.=-]|:\/\/)(?=[\p{L}\p{N}@])|(?<=\p{Ll})(?=\p{Lu})/u;

/**
 * Text with a chance to wrap between the parts of each long name in it, such as an environment
 * variable, a file's path or a function, so it breaks there on a narrow screen and never inside a
 * word. A short one is left whole: it wraps as a word does.
 */
function breakable(text: string) {
  return text.split(/(\s+)/).flatMap((word) => {
    if (word.length < LONG_NAME) return [word];
    const parts = word.split(NAME_PARTS);
    return parts.flatMap((part, index) => (index === 0 ? [part] : [<wbr />, part]));
  });
}

/** A run of text with its emphasis, the code innermost, or a link. */
function renderInline(inline: Inline) {
  if (inline.type === "link") {
    // Only an https: address leaves the site; the validator lets no other kind through.
    const external = inline.href.startsWith("https://");
    return (
      <a href={inline.href} rel={external ? "noopener noreferrer" : undefined}>
        {breakable(inline.text)}
      </a>
    );
  }
  let node: unknown = inline.text;
  if (inline.code) {
    // A short name is read whole, so it never wraps, not even at a hyphen; a long one wraps
    // between its parts.
    node =
      inline.text.length < LONG_NAME ? (
        <code class="name">{inline.text}</code>
      ) : (
        <code>{breakable(inline.text)}</code>
      );
  }
  if (inline.emphasis) node = <em>{node}</em>;
  if (inline.strong) node = <strong>{node}</strong>;
  return node;
}

function renderInlines(content: InlineContent) {
  return content.map(renderInline);
}

/**
 * A reading page: one content page drawn as semantic HTML, the title and summary in the hero, the
 * body as an article cut into sections at its level 2 headings, a table of contents built from its
 * headings and, in the docs, the section's navigation and links to the page before and after.
 *
 * The page arrives as JSON in an attribute the prerenderer wrote, and is validated again here
 * before anything is drawn: every piece of it becomes an element or text, never markup.
 */
@Component({ tag: "site-content-page" })
export class SiteContentPage {
  /** The labels the CMS gives the navigation's pages, as JSON, from the prerenderer. */
  @Prop() readonly navigation: string = "";

  /** The content page, as JSON. */
  @Prop() readonly page: string = "";

  /** What the last press of a copy button did, for a polite status. */
  @State() private copyStatus = "";

  private async copy(block: CodeBlock): Promise<void> {
    const name = `the ${block.caption ?? LANGUAGE_NAMES[block.language]} sample`;
    try {
      await navigator.clipboard.writeText(block.code);
      this.copyStatus = `Copied ${name}.`;
    } catch {
      this.copyStatus = `Could not copy ${name}. Select the code and copy it instead.`;
    }
  }

  private renderCode(block: CodeBlock) {
    const language = LANGUAGE_NAMES[block.language];
    return (
      <figure class="code-sample">
        <figcaption class="code-head">
          <span class="code-language">{language}</span>
          {block.caption === undefined ? null : <span class="code-caption">{block.caption}</span>}
          <idg-button
            class="needs-script code-copy"
            variant="ghost"
            size="sm"
            onClick={() => void this.copy(block)}
          >
            <idg-icon slot="start" name="copy" />
            Copy<span class="visually-hidden"> the {block.caption ?? language} sample</span>
          </idg-button>
        </figcaption>
        {/* Focusable, so a sample wider than its column can be scrolled with the keyboard. */}
        <pre tabindex="0">
          <code>{block.code}</code>
        </pre>
      </figure>
    );
  }

  private renderTable(block: TableBlock, id: string) {
    return (
      <div class="table-scroll" role="region" aria-labelledby={id} tabindex="0">
        <table>
          <caption id={id}>{block.caption}</caption>
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th scope="col">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr>
                {row.map((cell) => (
                  <td>{renderInlines(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  private renderBlock(block: Block, index: number) {
    switch (block.type) {
      case "heading": {
        const Heading = `h${String(block.level)}`;
        return <Heading id={headingId(block.text)}>{block.text}</Heading>;
      }
      case "paragraph":
        return <p>{renderInlines(block.content)}</p>;
      case "list": {
        const List = block.style === "numbered" ? "ol" : "ul";
        return (
          <List class="prose-list">
            {block.items.map((item) => (
              <li>{renderInlines(item)}</li>
            ))}
          </List>
        );
      }
      case "code":
        return this.renderCode(block);
      case "callout":
        return (
          <idg-alert class="callout" variant={block.tone === "warning" ? "warning" : "info"} quiet>
            {block.title === undefined ? null : <span slot="title">{block.title}</span>}
            {renderInlines(block.content)}
          </idg-alert>
        );
      case "table":
        // A heading's id holds only letters, digits and hyphens, so no heading can take this one.
        return this.renderTable(block, `table_${String(index)}`);
      case "example":
        return this.renderExample(block);
    }
  }

  /**
   * A component's example is the live element beside the HTML that writes it; the home page's demos
   * stand alone. Both are in a figure with the caption under it.
   */
  private renderExample(block: ExampleBlock) {
    const caption = block.caption === undefined ? null : <figcaption>{block.caption}</figcaption>;
    if (!isComponentExample(block.name)) {
      return (
        <figure class={`example example-${block.name}`}>
          {SHOWCASES[block.name]()}
          {caption}
        </figure>
      );
    }
    const example: { readonly nodes: readonly ExampleNode[]; readonly inert?: true } =
      COMPONENT_EXAMPLES[block.name];
    const stage = example.nodes.map(drawExample);
    return (
      <figure class="example example-component">
        <div class="example-body">
          <div class="example-stage">
            {example.inert === true ? (
              <div class="preview-frame" inert>
                {stage}
              </div>
            ) : (
              stage
            )}
          </div>
          {this.renderCode({
            type: "code",
            language: "html",
            code: usageSnippet(example.nodes),
            caption: "Usage",
          })}
        </div>
        {caption}
      </figure>
    );
  }

  private renderSection(section: BodySection, body: readonly Block[]) {
    const blocks = section.blocks.map((block) => this.renderBlock(block, body.indexOf(block) + 1));
    if (!section.heading) return <div class="prose-intro">{blocks}</div>;
    const id = headingId(section.heading.text);
    return (
      <section class="prose-section" aria-labelledby={id}>
        <h2 id={id}>{section.heading.text}</h2>
        {blocks}
      </section>
    );
  }

  /**
   * The table of contents, drawn twice: in the shell's aside, where the home page has its own, and
   * beside the article for the layouts that draw no aside (centered, side-rail and split-hero). The
   * stylesheet shows one of the two in each layout.
   */
  private renderContents(page: ContentPage, inline: boolean) {
    const entries = tableOfContents(page.body);
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
  }

  private renderSectionNavigation(route: ContentRoute) {
    const pages = sectionOf(route.path);
    if (pages.length === 0) return null;
    return (
      <nav class="docs-pages" aria-labelledby="docs-pages-title">
        <h2 id="docs-pages-title">{pages[0]?.label}</h2>
        <ul>
          {pages.map((page) => (
            <li>
              <a href={page.path} aria-current={page.path === route.path ? "page" : undefined}>
                {/* The section's top page is its overview; the section's name heads the list. */}
                {page === pages[0] ? "Overview" : page.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  private renderPager(route: ContentRoute) {
    const { previous, next } = neighboursOf(route.path);
    if (!previous && !next) return null;
    return (
      <nav class="pager" aria-label="Previous and next">
        {previous ? (
          <a class="pager-link pager-previous" href={previous.path} rel="prev">
            <span class="pager-direction">Previous</span>
            <span class="pager-title">{previous.label}</span>
          </a>
        ) : null}
        {next ? (
          <a class="pager-link pager-next" href={next.path} rel="next">
            <span class="pager-direction">Next</span>
            <span class="pager-title">{next.label}</span>
          </a>
        ) : null}
      </nav>
    );
  }

  private renderUnavailable() {
    return (
      <SiteShell current={undefined} navigation={this.navigation}>
        <section class="not-found" aria-labelledby="page-title">
          <h1 id="page-title">This page could not be shown</h1>
          <p class="lede">
            Its content did not pass the site's checks. The home page lists everything else.
          </p>
        </section>
      </SiteShell>
    );
  }

  render() {
    const result = readContentPage(this.page);
    const route = result.ok ? routeOfContent(result.page.slug) : undefined;
    if (!result.ok || !route) return this.renderUnavailable();
    const { page } = result;
    const section = sectionOf(route.path);
    // A page that sits under another without a section's navigation (a component's) links back.
    const parent =
      route.parent !== undefined && section.length === 0 ? routeOfPath(route.parent) : undefined;
    return (
      <SiteShell current={route.path} navigation={this.navigation}>
        <div slot="hero" class="page-hero">
          <p class="eyebrow">
            {parent === undefined ? (
              (section[0]?.label ?? route.label)
            ) : (
              <a href={parent.path}>{parent.label}</a>
            )}
          </p>
          <h1 id="page-title">{page.title}</h1>
          <p class="lede">{page.summary}</p>
        </div>
        <div class="reading">
          <div class={{ "reading-body": true, "with-section": section.length > 0 }}>
            <div class="reading-guide">
              {this.renderSectionNavigation(route)}
              {this.renderContents(page, true)}
            </div>
            <article class="prose" aria-labelledby="page-title">
              {sectionsOf(page.body).map((part) => this.renderSection(part, page.body))}
            </article>
            {this.renderPager(route)}
            <p class="visually-hidden" role="status">
              {this.copyStatus}
            </p>
          </div>
        </div>
        {this.renderContents(page, false)}
      </SiteShell>
    );
  }
}
