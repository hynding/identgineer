import { codePointLength, isAllowedCodePoint, isXmlWhitespace } from "./svg-characters.ts";
import type { SvgLogoLimits } from "./svg-logo-limits.ts";
import { SvgLogoRejection } from "./svg-logo-rejection.ts";

export interface XmlAttribute {
  /** The qualified name as written: `fill`, `xlink:href`. */
  readonly name: string;
  /** With references decoded and literal tabs and line feeds read as spaces, as XML reads them. */
  readonly value: string;
  readonly offset: number;
}

export interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: readonly XmlAttribute[];
  readonly children: readonly XmlNode[];
  readonly offset: number;
}

/** Character data, CDATA sections merged in as the text they hold. */
export interface XmlText {
  readonly kind: "text";
  readonly text: string;
  /** How long the text is in code points, kept as runs are joined so none is counted twice. */
  readonly length: number;
  readonly offset: number;
}

export type XmlNode = XmlElement | XmlText;

export interface XmlDocument {
  readonly root: XmlElement;
  /** Where a document type declaration that was read and skipped begins, if there was one. */
  readonly doctype: number | undefined;
}

interface OpenElement {
  readonly name: string;
  readonly attributes: readonly XmlAttribute[];
  readonly children: XmlNode[];
  readonly offset: number;
}

// One optional prefix, ASCII only. XML allows far more (any number of colons, most of Unicode);
// none of it is needed for SVG, and every extra form is one more way to disagree with a browser.
const NAME = /^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/;
const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};
// XML's PubidChar, less the quote that delimits the literal (checked apart).
const PUBLIC_ID = /^[ \r\na-zA-Z0-9'()+,./:=?;!*#@$_%-]*$/;
// A system identifier may hold anything but its quote in XML; these four are refused as well, since
// a reader that does not track quotes would end the declaration or open a subset at them.
const SYSTEM_ID = /^[^<>[\]]*$/;
const MAX_DECIMAL_DIGITS = 7;
const MAX_HEX_DIGITS = 6;

function isNameUnit(unit: number): boolean {
  return (
    (unit >= 0x61 && unit <= 0x7a) ||
    (unit >= 0x41 && unit <= 0x5a) ||
    (unit >= 0x30 && unit <= 0x39) ||
    unit === 0x5f ||
    unit === 0x2d ||
    unit === 0x2e ||
    unit === 0x3a
  );
}

export function isLocalPathValue(name: string): boolean {
  const local = name.slice(name.indexOf(":") + 1);
  return local === "d" || local === "points";
}

/**
 * A strict reader for the subset of XML 1.0 a logo needs: an optional XML declaration (version
 * 1.0, UTF-8), comments, an optional document type declaration with no internal subset (read and
 * skipped: no DTD is fetched and nothing it declares is honoured), one root element, elements with
 * quoted attributes, character data, CDATA sections, the five predefined entities and character
 * references. A document type declaration with an internal subset, a processing instruction, an
 * unknown entity, a malformed or overlong character reference, an unquoted or repeated attribute, a
 * stray `<` or `]]>`, an unclosed or mismatched tag, or anything else outside that subset refuses
 * the whole document. It works in one pass, in time linear in the input, and never recurses.
 */
class Reader {
  private position = 0;
  private elementCount = 0;
  private doctype: number | undefined;

  private readonly text: string;
  private readonly limits: SvgLogoLimits;

  constructor(text: string, limits: SvgLogoLimits) {
    this.text = text;
    this.limits = limits;
  }

  readDocument(): XmlDocument {
    if (this.text.startsWith("<?xml") && isXmlWhitespace(this.text.charCodeAt(5))) {
      this.readDeclaration();
    }
    this.skipMisc(true);
    if (this.text.charCodeAt(this.position) !== 0x3c) {
      this.fail("malformed", "must start with the root element");
    }
    const root = this.readElement();
    this.skipMisc(false);
    if (this.position < this.text.length) {
      this.fail("malformed", "has content after the root element");
    }
    return { root, doctype: this.doctype };
  }

  private fail(code: SvgLogoRejection["code"], message: string, at = this.position): never {
    throw new SvgLogoRejection(code, message, at);
  }

  private startsWith(token: string): boolean {
    return this.text.startsWith(token, this.position);
  }

  private skipWhitespace(): boolean {
    const start = this.position;
    while (
      this.position < this.text.length &&
      isXmlWhitespace(this.text.charCodeAt(this.position))
    ) {
      this.position += 1;
    }
    return this.position > start;
  }

  private readDeclaration(): void {
    const start = this.position;
    this.position += 5;
    const order = ["version", "encoding", "standalone"];
    let next = 0;
    for (;;) {
      const spaced = this.skipWhitespace();
      if (this.startsWith("?>")) {
        this.position += 2;
        break;
      }
      if (!spaced) this.fail("invalid-declaration", "has a malformed XML declaration");
      const name = this.readName();
      this.skipWhitespace();
      if (this.text.charCodeAt(this.position) !== 0x3d) {
        this.fail("invalid-declaration", "has a malformed XML declaration");
      }
      this.position += 1;
      this.skipWhitespace();
      const quote = this.text[this.position];
      if (quote !== '"' && quote !== "'") {
        this.fail("invalid-declaration", "has a malformed XML declaration");
      }
      const end = this.text.indexOf(quote, this.position + 1);
      if (end === -1) this.fail("invalid-declaration", "has a malformed XML declaration");
      const value = this.text.slice(this.position + 1, end);
      this.position = end + 1;
      // version, then optionally encoding, then optionally standalone, each once, in that order.
      const index = order.indexOf(name);
      if (index < next || (next === 0 && index !== 0)) {
        this.fail("invalid-declaration", "has a malformed XML declaration", start);
      }
      next = index + 1;
      if (name === "version" && value !== "1.0") {
        this.fail("invalid-declaration", "must be XML 1.0", start);
      }
      if (name === "encoding" && value.toLowerCase() !== "utf-8") {
        this.fail("invalid-encoding", "must be UTF-8 and declare no other encoding", start);
      }
      if (name === "standalone" && value !== "yes" && value !== "no") {
        this.fail("invalid-declaration", "has a malformed XML declaration", start);
      }
    }
    if (next === 0) this.fail("invalid-declaration", "has a malformed XML declaration", start);
  }

  /** White space and comments, before and after the root, and one document type before it. */
  private skipMisc(beforeRoot: boolean): void {
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith("<!--")) {
        this.skipComment();
        continue;
      }
      if (beforeRoot && this.doctype === undefined && this.startsWith("<!DOCTYPE")) {
        this.readDoctype();
        continue;
      }
      if (this.startsWith("<![CDATA[")) {
        this.fail("malformed", "has a CDATA section outside the root element");
      }
      this.refuseMarkupDeclarations();
      return;
    }
  }

  private refuseMarkupDeclarations(): void {
    if (this.startsWith("<?")) {
      this.fail("processing-instruction", "may not hold a processing instruction");
    }
    if (this.startsWith("<!DOCTYPE") || this.startsWith("<!doctype")) {
      this.fail("doctype", "may not hold a document type declaration");
    }
    if (this.startsWith("<!") && !this.startsWith("<![CDATA[")) {
      this.fail("malformed", "has a markup declaration that is not allowed");
    }
  }

  /**
   * `<!DOCTYPE` name, then optionally `SYSTEM "system id"` or `PUBLIC "public id" "system id"`,
   * then `>`, exactly as XML spells it. An internal subset (`[`) refuses the document: that is where
   * entities are declared. The identifiers are read only to find the end; nothing is fetched.
   */
  private readDoctype(): void {
    const start = this.position;
    const refuse = (): never =>
      this.fail("doctype", "has a malformed document type declaration", start);
    this.position += "<!DOCTYPE".length;
    if (!this.skipWhitespace()) refuse();
    const nameStart = this.position;
    while (
      this.position - nameStart < this.limits.nameLength &&
      isNameUnit(this.text.charCodeAt(this.position))
    ) {
      this.position += 1;
    }
    if (!NAME.test(this.text.slice(nameStart, this.position))) refuse();
    if (this.skipWhitespace() && (this.startsWith("SYSTEM") || this.startsWith("PUBLIC"))) {
      const isPublic = this.startsWith("PUBLIC");
      this.position += "SYSTEM".length;
      if (!this.skipWhitespace()) refuse();
      if (isPublic) {
        if (!PUBLIC_ID.test(this.readDoctypeLiteral(refuse))) refuse();
        if (!this.skipWhitespace()) refuse();
      }
      if (!SYSTEM_ID.test(this.readDoctypeLiteral(refuse))) refuse();
      this.skipWhitespace();
    }
    if (this.startsWith("[")) {
      this.fail(
        "doctype",
        "may not hold a document type declaration with an internal subset",
        start,
      );
    }
    if (!this.startsWith(">")) refuse();
    this.position += 1;
    this.doctype = start;
  }

  private readDoctypeLiteral(refuse: () => never): string {
    const quote = this.text[this.position];
    if (quote !== '"' && quote !== "'") refuse();
    const end = this.text.indexOf(quote, this.position + 1);
    if (end === -1) refuse();
    const value = this.text.slice(this.position + 1, end);
    this.position = end + 1;
    return value;
  }

  private skipComment(): void {
    const start = this.position;
    const end = this.text.indexOf("-->", start + 4);
    if (end === -1) this.fail("invalid-comment", "has an unclosed comment", start);
    const body = this.text.slice(start + 4, end);
    // XML forbids `--` inside and a `-` at the end; a leading `>` or `->` is a comment that HTML
    // closes at once, so the two languages would disagree about where it ends.
    if (
      body.includes("--") ||
      body.endsWith("-") ||
      body.startsWith(">") ||
      body.startsWith("->")
    ) {
      this.fail("invalid-comment", "has a comment XML and HTML would read differently", start);
    }
    this.position = end + 3;
  }

  private readName(): string {
    const start = this.position;
    while (
      this.position < this.text.length &&
      isNameUnit(this.text.charCodeAt(this.position)) &&
      this.position - start <= this.limits.nameLength
    ) {
      this.position += 1;
    }
    const name = this.text.slice(start, this.position);
    const next = this.text.charCodeAt(this.position);
    // A name ends at white space, `=`, `/`, `>` or `?`; anything else (an entity, a letter from
    // outside ASCII) would be part of the name in some reader, so the name is refused.
    if (
      this.position < this.text.length &&
      !isXmlWhitespace(next) &&
      next !== 0x3d &&
      next !== 0x2f &&
      next !== 0x3e &&
      next !== 0x3f
    ) {
      this.fail("invalid-name", "has a name outside the allowed form", start);
    }
    if (name.length > this.limits.nameLength) {
      this.fail("too-long", `has a name longer than ${String(this.limits.nameLength)}`, start);
    }
    if (!NAME.test(name)) this.fail("invalid-name", "has a name outside the allowed form", start);
    return name;
  }

  /** Reads `&...;` at the current position and returns the text it stands for. */
  private readReference(): string {
    const start = this.position;
    // The longest reference allowed is `&#` and seven digits, then `;`: looking no further keeps
    // a run of bare ampersands from being scanned to the end again and again.
    const window = this.text.slice(start, start + 3 + MAX_DECIMAL_DIGITS);
    const length = window.indexOf(";");
    if (length === -1) this.fail("invalid-entity", "has a malformed reference", start);
    const body = window.slice(1, length);
    this.position = start + length + 1;
    if (body.startsWith("#x")) {
      const digits = body.slice(2);
      if (digits.length === 0 || digits.length > MAX_HEX_DIGITS || !/^[0-9a-fA-F]+$/.test(digits)) {
        this.fail("invalid-entity", "has a malformed character reference", start);
      }
      return this.codePoint(Number.parseInt(digits, 16), start);
    }
    if (body.startsWith("#")) {
      const digits = body.slice(1);
      if (digits.length === 0 || digits.length > MAX_DECIMAL_DIGITS || !/^[0-9]+$/.test(digits)) {
        this.fail("invalid-entity", "has a malformed character reference", start);
      }
      return this.codePoint(Number.parseInt(digits, 10), start);
    }
    const predefined = Object.hasOwn(PREDEFINED_ENTITIES, body)
      ? PREDEFINED_ENTITIES[body]
      : undefined;
    if (predefined === undefined) {
      this.fail("invalid-entity", "has an entity other than the five XML predefines", start);
    }
    return predefined;
  }

  private codePoint(value: number, start: number): string {
    if (!isAllowedCodePoint(value)) {
      this.fail("invalid-character", "has a character reference to a character not allowed", start);
    }
    return String.fromCodePoint(value);
  }

  private readAttributeValue(name: string): string {
    const quote = this.text[this.position];
    if (quote !== '"' && quote !== "'") this.fail("malformed", "has an attribute without quotes");
    const start = this.position + 1;
    const end = this.text.indexOf(quote, start);
    if (end === -1) this.fail("malformed", "has an unclosed attribute value", this.position);
    const max = isLocalPathValue(name)
      ? this.limits.pathDataLength
      : this.limits.attributeValueLength;
    if (end - start > max) {
      this.fail("too-long", `has an attribute value longer than ${String(max)}`, start);
    }
    let value = "";
    this.position = start;
    while (this.position < end) {
      const unit = this.text.charCodeAt(this.position);
      if (unit === 0x3c) this.fail("malformed", "has a < inside an attribute value");
      if (unit === 0x26) {
        value += this.readReference();
        if (this.position > end) this.fail("malformed", "has a reference across a quote", start);
        continue;
      }
      value += unit === 0x9 || unit === 0xa ? " " : this.text.charAt(this.position);
      this.position += 1;
    }
    this.position = end + 1;
    return value;
  }

  private readStartTag(): { element: OpenElement; empty: boolean } {
    const offset = this.position;
    this.elementCount += 1;
    if (this.elementCount > this.limits.elements) {
      this.fail("too-many-elements", `has more than ${String(this.limits.elements)} elements`);
    }
    this.position += 1;
    const name = this.readName();
    const attributes: XmlAttribute[] = [];
    const names = new Set<string>();
    for (;;) {
      const spaced = this.skipWhitespace();
      if (this.startsWith("/>")) {
        this.position += 2;
        return { element: { name, attributes, children: [], offset }, empty: true };
      }
      if (this.startsWith(">")) {
        this.position += 1;
        return { element: { name, attributes, children: [], offset }, empty: false };
      }
      if (this.position >= this.text.length) this.fail("malformed", "ends inside a tag", offset);
      if (!spaced) this.fail("malformed", "has attributes not separated by white space");
      const attributeOffset = this.position;
      const attributeName = this.readName();
      if (names.has(attributeName)) {
        this.fail("duplicate-attribute", "repeats an attribute", attributeOffset);
      }
      names.add(attributeName);
      if (names.size > this.limits.attributesPerElement) {
        this.fail(
          "too-many-attributes",
          `has more than ${String(this.limits.attributesPerElement)} attributes on one element`,
          attributeOffset,
        );
      }
      this.skipWhitespace();
      if (this.text.charCodeAt(this.position) !== 0x3d) {
        this.fail("malformed", "has an attribute without a value");
      }
      this.position += 1;
      this.skipWhitespace();
      const value = this.readAttributeValue(attributeName);
      attributes.push({ name: attributeName, value, offset: attributeOffset });
    }
  }

  private readText(stack: readonly OpenElement[]): void {
    const start = this.position;
    let end = this.text.indexOf("<", start);
    if (end === -1) end = this.text.length;
    const raw = this.text.slice(start, end);
    if (raw.includes("]]>")) this.fail("malformed", "has ]]> in text", start + raw.indexOf("]]>"));
    // Measured in the code points it reads as, not as written: the writer escapes `>` and `"`, so
    // a limit on the written form would refuse what it writes from text read within the limit.
    let text = "";
    let length = 0;
    while (this.position < end) {
      if (length > this.limits.textLength) {
        this.fail("too-long", `has a run of text longer than ${String(this.limits.textLength)}`);
      }
      if (this.text.charCodeAt(this.position) === 0x26) {
        const character = this.readReference();
        text += character;
        length += codePointLength(character);
        if (this.position > end) this.fail("malformed", "has a malformed reference", start);
        continue;
      }
      const unit = this.text.charCodeAt(this.position);
      text += this.text.charAt(this.position);
      if (!(unit >= 0xdc00 && unit <= 0xdfff)) length += 1;
      this.position += 1;
    }
    if (length > this.limits.textLength) {
      this.fail("too-long", `has a run of text longer than ${String(this.limits.textLength)}`);
    }
    this.appendText(stack, text, length, start);
  }

  private readCdata(stack: readonly OpenElement[]): void {
    const start = this.position;
    const end = this.text.indexOf("]]>", start + 9);
    if (end === -1) this.fail("malformed", "has an unclosed CDATA section", start);
    const text = this.text.slice(start + 9, end);
    const length = codePointLength(text);
    if (length > this.limits.textLength) {
      this.fail("too-long", `has a run of text longer than ${String(this.limits.textLength)}`);
    }
    this.appendText(stack, text, length, start);
    this.position = end + 3;
  }

  private appendText(
    stack: readonly OpenElement[],
    text: string,
    length: number,
    offset: number,
  ): void {
    const parent = stack.at(-1);
    if (parent === undefined || text === "") return;
    const last = parent.children.at(-1);
    if (last?.kind === "text") {
      if (last.length + length > this.limits.textLength) {
        this.fail("too-long", `has a run of text longer than ${String(this.limits.textLength)}`);
      }
      parent.children[parent.children.length - 1] = {
        kind: "text",
        text: last.text + text,
        length: last.length + length,
        offset: last.offset,
      };
      return;
    }
    parent.children.push({ kind: "text", text, length, offset });
  }

  private readEndTag(): string {
    const start = this.position;
    this.position += 2;
    const name = this.readName();
    this.skipWhitespace();
    if (this.text.charCodeAt(this.position) !== 0x3e) {
      this.fail("malformed", "has a malformed end tag", start);
    }
    this.position += 1;
    return name;
  }

  private readElement(): XmlElement {
    const stack: OpenElement[] = [];
    const first = this.readStartTag();
    if (first.empty) return close(first.element);
    stack.push(first.element);
    for (;;) {
      const current = stack.at(-1);
      if (current === undefined) break;
      if (this.position >= this.text.length) {
        this.fail("mismatched-tag", "has an element that is never closed", current.offset);
      }
      if (this.startsWith("</")) {
        const start = this.position;
        if (this.readEndTag() !== current.name) {
          this.fail("mismatched-tag", "has an end tag that does not match its start tag", start);
        }
        stack.pop();
        const closed = close(current);
        const parent = stack.at(-1);
        if (parent === undefined) return closed;
        parent.children.push(closed);
        continue;
      }
      if (this.startsWith("<!--")) {
        this.skipComment();
        continue;
      }
      if (this.startsWith("<![CDATA[")) {
        this.readCdata(stack);
        continue;
      }
      this.refuseMarkupDeclarations();
      if (this.startsWith("<")) {
        const start = this.position;
        const { element, empty } = this.readStartTag();
        if (stack.length >= this.limits.depth) {
          this.fail("too-deep", `nests elements deeper than ${String(this.limits.depth)}`, start);
        }
        if (empty) current.children.push(close(element));
        else stack.push(element);
        continue;
      }
      this.readText(stack);
    }
    return this.fail("malformed", "has no root element");
  }
}

function close(element: OpenElement): XmlElement {
  return { kind: "element", ...element };
}

/** Reads normalised text (see `decodeSvgInput`) into a tree, or throws an `SvgLogoRejection`. */
export function parseSvgXml(text: string, limits: SvgLogoLimits): XmlDocument {
  return new Reader(text, limits).readDocument();
}
