import {
  CODE_LANGUAGES,
  CONTENT_LIMITS,
  EXAMPLE_NAMES,
  type Block,
  type BlockType,
  type ContentPage,
  type Inline,
  type InlineContent,
  type Seo,
  type TextRun,
} from "./content-page.ts";
import { RESERVED_IDS, headingId } from "./headings.ts";

/** What a page is checked against: the paths of the site's live pages, which links may name. */
export interface ValidationContext {
  readonly paths: ReadonlySet<string>;
}

/** Where a page was refused and why: which page, which block, which field and which rule. */
export interface ContentError {
  /** The page's slug, or none when it has no valid slug to be named by. */
  readonly page: string | undefined;
  /** The block's place in the body, from 1, and its type when it has a known one. */
  readonly block?: { readonly index: number; readonly type: BlockType | undefined };
  /** The field inside the page or the block, as `content[2].href`. */
  readonly path: string;
  readonly message: string;
}

export type ContentResult =
  | { readonly ok: true; readonly page: ContentPage }
  | { readonly ok: false; readonly error: ContentError };

/** One line for a build warning or a test: `page "x", block 3 (paragraph): content[0].href: …`. */
export function describeContentError({ page, block, path, message }: ContentError): string {
  const where = [page === undefined ? "page (no slug)" : `page "${printable(page, 120)}"`];
  if (block) where.push(`block ${String(block.index)}${block.type ? ` (${block.type})` : ""}`);
  return `${where.join(", ")}: ${path === "" ? "" : `${path}: `}${message}`;
}

const BLOCK_TYPES: readonly BlockType[] = [
  "heading",
  "paragraph",
  "list",
  "code",
  "callout",
  "table",
  "example",
];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether a value could be a page's slug, and so may be printed as it is to name the page. */
export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= CONTENT_LIMITS.slug && SLUG.test(value);
}

/**
 * C0 and C1 controls, delete, the bidirectional marks, embeddings, overrides and isolates (which
 * can make text read differently from what it holds), the characters that take no room and hide in
 * text (the zero-width space, the word joiner and the invisible operators, the byte order mark, the
 * Mongolian vowel separator), the line and paragraph separators and lone surrogates. Code may hold
 * a newline and a tab; nothing else may.
 *
 * The zero-width joiner and non-joiner (U+200C, U+200D) are kept: an emoji sequence and the
 * shaping of Persian and the Indic scripts need them, and neither reorders or hides other text.
 */
/* eslint-disable no-control-regex -- matching control characters is the point of these two. */
const FORBIDDEN_IN_TEXT =
  /[\u0000-\u001f\u007f-\u009f\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u2028\u2029\ufeff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const FORBIDDEN_IN_CODE =
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u2028\u2029\ufeff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
/* eslint-enable no-control-regex */

class Refusal extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.path = path;
  }
}

/**
 * Text from outside, made safe to print in a message or a build log: at most `limit` characters,
 * printable ASCII only, everything else (controls, bidi overrides, any other character) written as
 * `\uXXXX`, and a quote or a backslash escaped, so a line says what was sent and can do nothing.
 */
export function printable(text: string, limit = 60): string {
  let out = "";
  for (const character of text.slice(0, limit)) {
    const point = character.codePointAt(0) ?? 0;
    if (character === '"' || character === "\\") out += `\\${character}`;
    else if (point >= 0x20 && point <= 0x7e) out += character;
    else {
      for (let index = 0; index < character.length; index += 1) {
        out += `\\u${character.charCodeAt(index).toString(16).padStart(4, "0")}`;
      }
    }
  }
  return text.length > limit ? `${out}...` : out;
}

/** A value a message names: text in quotes, made printable; anything else by what it is. */
function quote(value: unknown): string {
  if (typeof value === "string") return `"${printable(value)}"`;
  if (typeof value === "number" || typeof value === "boolean") {
    return printable(String(value));
  }
  if (value === null) return "null";
  if (value === undefined) return "nothing";
  return Array.isArray(value)
    ? "a list"
    : `a${typeof value === "object" ? "n object" : ` ${typeof value}`}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function join(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${String(key)}]`;
  // A key may come from outside (an unknown field), so it is named short and printable.
  const name = printable(key, 40);
  return path === "" ? name : `${path}.${name}`;
}

/** Reads one object, field by field, and refuses any field it was not asked for. */
function fieldsOf(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Refusal(path, "must be an object");
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Refusal(join(path, key), "is not a field of the format");
    }
  }
  for (const key of required) {
    if (!(key in value)) throw new Refusal(join(path, key), "is required");
  }
  return value;
}

function text(
  value: unknown,
  path: string,
  limit: number,
  { code = false, blank = false }: { code?: boolean; blank?: boolean } = {},
): string {
  if (typeof value !== "string") throw new Refusal(path, "must be text");
  if (value.length > limit) {
    throw new Refusal(path, `must be at most ${String(limit)} characters`);
  }
  const forbidden = (code ? FORBIDDEN_IN_CODE : FORBIDDEN_IN_TEXT).exec(value);
  if (forbidden) {
    const point = forbidden[0].codePointAt(0) ?? 0;
    throw new Refusal(
      path,
      `holds a control or formatting character (U+${point.toString(16).toUpperCase().padStart(4, "0")})`,
    );
  }
  if (!blank && value.trim() === "") throw new Refusal(path, "must not be empty");
  return value;
}

function optionalText(
  fields: Record<string, unknown>,
  key: string,
  path: string,
  limit: number,
): string | undefined {
  return key in fields ? text(fields[key], join(path, key), limit) : undefined;
}

function oneOf<T extends string>(
  value: unknown,
  path: string,
  values: readonly T[],
  what = `one of ${values.join(", ")}`,
): T {
  if (typeof value === "string" && (values as readonly string[]).includes(value)) return value as T;
  throw new Refusal(path, `${quote(value)} is not ${what}`);
}

function arrayOf(value: unknown, path: string, min: 0 | 1, max: number, noun: string): unknown[] {
  if (!Array.isArray(value)) throw new Refusal(path, "must be a list");
  if (value.length < min) throw new Refusal(path, `must hold at least one ${noun}`);
  if (value.length > max) {
    throw new Refusal(path, `must hold at most ${String(max)} ${noun}s`);
  }
  holes(value, path);
  return value;
}

/** A list with a hole in it (`[a, , b]`) reads as `[a, null, b]` once written as JSON: refused. */
function holes(value: unknown[], path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) throw new Refusal(join(path, index), "is a hole in the list");
  }
}

function flag(fields: Record<string, unknown>, key: string, path: string): boolean | undefined {
  if (!(key in fields)) return undefined;
  const value = fields[key];
  if (typeof value !== "boolean") throw new Refusal(join(path, key), "must be true or false");
  return value;
}

/**
 * A path of the site as the route table writes it: given exactly, or without its last slash (as a
 * CMS's link field lets an editor write `/identity`), which is put back.
 */
function sitePath(href: string, paths: ReadonlySet<string>): string | undefined {
  if (paths.has(href)) return href;
  return !href.endsWith("/") && paths.has(`${href}/`) ? `${href}/` : undefined;
}

const LINK_REFUSED = "is not a path of the site, a heading of this page or an https: address";

/**
 * A link's target, as content may name it: a live path of the site exactly as the route table has
 * it, a heading of this page (`#id`), or an `https:` address without credentials. Anything else is
 * refused, `javascript:`, `data:`, `http:`, protocol-relative and backslashed paths among them.
 */
function linkTarget(value: unknown, path: string, context: ValidationContext): string {
  const href = text(value, path, CONTENT_LIMITS.href);
  if (href.startsWith("#")) return href;
  if (href.startsWith("/")) {
    const page = sitePath(href, context.paths);
    if (page !== undefined) return page;
    throw new Refusal(path, `${quote(href)} ${LINK_REFUSED}`);
  }
  if (href.startsWith("https://") && !/[\s\\]/.test(href)) {
    try {
      const url = new URL(href);
      if (url.protocol === "https:" && url.username === "" && url.password === "" && url.host) {
        return href;
      }
    } catch {
      // Refused below, as any other target is.
    }
  }
  throw new Refusal(path, `${quote(href)} ${LINK_REFUSED}`);
}

/** Reads one page's worth of blocks, keeping count of what bounds the whole page. */
class BodyReader {
  private textLength = 0;
  private lastHeadingLevel = 0;
  private readonly headingIds = new Map<string, number>();
  private readonly fragments: { readonly href: string; readonly path: string; block: number }[] =
    [];
  block = 0;

  private readonly context: ValidationContext;

  constructor(context: ValidationContext) {
    this.context = context;
  }

  private count(value: string): string {
    this.textLength += value.length;
    if (this.textLength > CONTENT_LIMITS.bodyText) {
      throw new Refusal(
        "",
        `holds more than ${String(CONTENT_LIMITS.bodyText)} characters of text, with the blocks before it`,
      );
    }
    return value;
  }

  private inline(value: unknown, path: string): Inline {
    if (!isPlainObject(value)) throw new Refusal(path, "must be an object");
    const type = oneOf(value.type, join(path, "type"), ["text", "link"], "an inline type");
    if (type === "link") {
      const fields = fieldsOf(value, path, ["type", "href", "text"]);
      const href = linkTarget(fields.href, join(path, "href"), this.context);
      if (href.startsWith("#"))
        this.fragments.push({ href, path: join(path, "href"), block: this.block });
      return {
        type,
        href,
        text: this.count(text(fields.text, join(path, "text"), CONTENT_LIMITS.run)),
      };
    }
    const fields = fieldsOf(value, path, ["type", "text"], ["strong", "emphasis", "code"]);
    // A run may be a space between two others, so it need not hold anything else.
    const strong = flag(fields, "strong", path);
    const emphasis = flag(fields, "emphasis", path);
    const code = flag(fields, "code", path);
    const run: TextRun = {
      type,
      text: this.count(text(fields.text, join(path, "text"), CONTENT_LIMITS.run, { blank: true })),
      ...(strong === undefined ? {} : { strong }),
      ...(emphasis === undefined ? {} : { emphasis }),
      ...(code === undefined ? {} : { code }),
    };
    return run;
  }

  private inlineContent(value: unknown, path: string): InlineContent {
    const runs = arrayOf(value, path, 1, CONTENT_LIMITS.runs, "inline");
    return runs.map((run, index) => this.inline(run, join(path, index)));
  }

  private heading(value: Record<string, unknown>): Block {
    const fields = fieldsOf(value, "", ["type", "level", "text"]);
    const level = fields.level;
    if (level !== 2 && level !== 3 && level !== 4) {
      throw new Refusal("level", "must be 2, 3 or 4: the page title is the one level 1 heading");
    }
    if (this.lastHeadingLevel === 0 && level !== 2) {
      throw new Refusal("level", `the first heading must be level 2, not ${String(level)}`);
    }
    if (this.lastHeadingLevel !== 0 && level > this.lastHeadingLevel + 1) {
      throw new Refusal(
        "level",
        `a level ${String(level)} heading cannot follow a level ${String(this.lastHeadingLevel)} one`,
      );
    }
    const heading = this.count(text(fields.text, "text", CONTENT_LIMITS.heading));
    const id = headingId(heading);
    if (id === "") throw new Refusal("text", "must hold a letter or a digit, for its address");
    if (RESERVED_IDS.has(id)) {
      throw new Refusal("text", `its address "#${id}" is one the page already uses`);
    }
    const taken = this.headingIds.get(id);
    if (taken !== undefined) {
      throw new Refusal("text", `its address "#${id}" is taken by block ${String(taken)}`);
    }
    this.headingIds.set(id, this.block);
    this.lastHeadingLevel = level;
    return { type: "heading", level, text: heading };
  }

  private table(value: Record<string, unknown>): Block {
    const fields = fieldsOf(value, "", ["type", "caption", "columns", "rows"]);
    const caption = this.count(text(fields.caption, "caption", CONTENT_LIMITS.caption));
    const columns = arrayOf(fields.columns, "columns", 1, CONTENT_LIMITS.columns, "column").map(
      (column, index) => this.count(text(column, join("columns", index), CONTENT_LIMITS.heading)),
    );
    const rows = arrayOf(fields.rows, "rows", 1, CONTENT_LIMITS.rows, "row").map((row, index) => {
      const path = join("rows", index);
      if (!Array.isArray(row)) throw new Refusal(path, "must be a list");
      holes(row, path);
      if (row.length !== columns.length) {
        throw new Refusal(
          path,
          `must have ${String(columns.length)} cells, one per column, not ${String(row.length)}`,
        );
      }
      return row.map((cell, cellIndex) => this.inlineContent(cell, join(path, cellIndex)));
    });
    return { type: "table", caption, columns, rows };
  }

  readBlock(value: unknown): Block {
    if (!isPlainObject(value)) throw new Refusal("", "must be an object");
    const type = oneOf(value.type, "type", BLOCK_TYPES, `a block type (${BLOCK_TYPES.join(", ")})`);
    switch (type) {
      case "heading":
        return this.heading(value);
      case "paragraph": {
        const fields = fieldsOf(value, "", ["type", "content"]);
        return { type, content: this.inlineContent(fields.content, "content") };
      }
      case "list": {
        const fields = fieldsOf(value, "", ["type", "style", "items"]);
        const style = oneOf(fields.style, "style", ["bulleted", "numbered"] as const);
        const items = arrayOf(fields.items, "items", 1, CONTENT_LIMITS.listItems, "item").map(
          (item, index) => this.inlineContent(item, join("items", index)),
        );
        return { type, style, items };
      }
      case "code": {
        const fields = fieldsOf(value, "", ["type", "language", "code"], ["caption"]);
        const language = oneOf(fields.language, "language", CODE_LANGUAGES);
        const code = this.count(text(fields.code, "code", CONTENT_LIMITS.code, { code: true }));
        if (code.split("\n").length > CONTENT_LIMITS.codeLines) {
          throw new Refusal("code", `must be at most ${String(CONTENT_LIMITS.codeLines)} lines`);
        }
        const caption = optionalText(fields, "caption", "", CONTENT_LIMITS.caption);
        return caption === undefined
          ? { type, language, code }
          : { type, language, code, caption: this.count(caption) };
      }
      case "callout": {
        const fields = fieldsOf(value, "", ["type", "tone", "content"], ["title"]);
        const tone = oneOf(fields.tone, "tone", ["note", "warning"] as const);
        const title = optionalText(fields, "title", "", CONTENT_LIMITS.heading);
        const content = this.inlineContent(fields.content, "content");
        return title === undefined
          ? { type, tone, content }
          : { type, tone, title: this.count(title), content };
      }
      case "table":
        return this.table(value);
      case "example": {
        const fields = fieldsOf(value, "", ["type", "name"], ["caption"]);
        const name = oneOf(
          fields.name,
          "name",
          EXAMPLE_NAMES,
          `a live example (${EXAMPLE_NAMES.join(", ")})`,
        );
        const caption = optionalText(fields, "caption", "", CONTENT_LIMITS.caption);
        return caption === undefined
          ? { type, name }
          : { type, name, caption: this.count(caption) };
      }
    }
  }

  /** A `#id` link is checked once every heading is known, so it may point down the page. */
  checkFragments(): void {
    for (const { href, path, block } of this.fragments) {
      if (!this.headingIds.has(href.slice(1))) {
        this.block = block;
        throw new Refusal(path, `${quote(href)} is not a heading of this page`);
      }
    }
  }

  typeOf(value: unknown): BlockType | undefined {
    if (!isPlainObject(value)) return undefined;
    const type = value.type;
    return typeof type === "string" && (BLOCK_TYPES as readonly string[]).includes(type)
      ? (type as BlockType)
      : undefined;
  }
}

function seoOf(value: unknown): Seo {
  const fields = fieldsOf(value, "seo", [], ["metaTitle", "metaDescription", "noIndex"]);
  const seo: { metaTitle?: string; metaDescription?: string; noIndex?: boolean } = {};
  const metaTitle = optionalText(fields, "metaTitle", "seo", CONTENT_LIMITS.metaTitle);
  const metaDescription = optionalText(
    fields,
    "metaDescription",
    "seo",
    CONTENT_LIMITS.metaDescription,
  );
  const noIndex = flag(fields, "noIndex", "seo");
  if (metaTitle !== undefined) seo.metaTitle = metaTitle;
  if (metaDescription !== undefined) seo.metaDescription = metaDescription;
  if (noIndex !== undefined) seo.noIndex = noIndex;
  return seo;
}

/**
 * Turns anything (a record of the repository, a CMS answer, a parsed attribute) into a valid
 * content page or a precise error. It never throws, and what it returns is a fresh copy holding
 * only the fields of the format.
 */
export function parseContentPage(input: unknown, context: ValidationContext): ContentResult {
  let page: string | undefined;
  const reader = new BodyReader(context);
  let inBody = false;
  let blocks: unknown[] = [];
  try {
    // Named by its slug from the start, if it has one, so even its first refusal says which page.
    const named = isPlainObject(input) ? input.slug : undefined;
    if (isSlug(named)) page = named;
    const fields = fieldsOf(input, "", ["slug", "title", "summary", "body", "seo"]);
    const slug = text(fields.slug, "slug", CONTENT_LIMITS.slug);
    if (!SLUG.test(slug)) throw new Refusal("slug", "must be lower-case words joined by hyphens");
    page = slug;
    const title = text(fields.title, "title", CONTENT_LIMITS.title);
    const summary = text(fields.summary, "summary", CONTENT_LIMITS.summary);
    const seo = seoOf(fields.seo);
    blocks = arrayOf(fields.body, "body", 1, CONTENT_LIMITS.blocks, "block");
    inBody = true;
    const body = blocks.map((block, index) => {
      reader.block = index + 1;
      return reader.readBlock(block);
    });
    reader.checkFragments();
    return { ok: true, page: { slug, title, summary, body, seo } };
  } catch (error) {
    // A getter that throws, or a proxy that refuses to be read, is refused like any other input.
    const refusal = error instanceof Refusal ? error : new Refusal("", "could not be read");
    const index = reader.block;
    return {
      ok: false,
      error: {
        page,
        ...(inBody && index > 0
          ? { block: { index, type: reader.typeOf(blocks[index - 1]) } }
          : {}),
        path: refusal.path,
        message: refusal.message,
      },
    };
  }
}

/** A navigation item of the CMS, which may name a page of the site's navigation by another label. */
export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly placement: "header" | "footer" | "utility";
  readonly order: number;
}

export type NavigationResult =
  | { readonly ok: true; readonly item: NavigationItem }
  | { readonly ok: false; readonly message: string };

const NAVIGATION_LABEL = 60;

/**
 * A navigation item checked as a page's text and links are: a label of plain text, and a target
 * that is a page of the site's own navigation (an item can rename a page there, never add a link).
 */
export function parseNavigationItem(
  input: unknown,
  navigationPaths: ReadonlySet<string>,
): NavigationResult {
  try {
    const fields = fieldsOf(input, "", ["label", "href", "placement", "order"]);
    const label = text(fields.label, "label", NAVIGATION_LABEL);
    const given = text(fields.href, "href", CONTENT_LIMITS.href);
    const href = sitePath(given, navigationPaths);
    if (href === undefined) {
      throw new Refusal("href", `${quote(given)} is not a page of the site's navigation`);
    }
    const placement = oneOf(fields.placement, "placement", [
      "header",
      "footer",
      "utility",
    ] as const);
    const order = fields.order;
    if (typeof order !== "number" || !Number.isInteger(order) || order < 0) {
      throw new Refusal("order", "must be a whole number, 0 or more");
    }
    return { ok: true, item: { label, href, placement, order } };
  } catch (error) {
    const refusal = error instanceof Refusal ? error : new Refusal("", "could not be read");
    return {
      ok: false,
      message: refusal.path === "" ? refusal.message : `${refusal.path}: ${refusal.message}`,
    };
  }
}
