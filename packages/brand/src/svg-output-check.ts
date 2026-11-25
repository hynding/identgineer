// An independent check of what the SVG logo sanitiser may emit, used by the tests. It shares no
// code with the sanitiser (its own tokeniser, its own copy of the allowlist, its own grammar for
// every value and its own rules for where each element may stand), so a mistake in one is not
// repeated in the other. It returns every problem it finds.

const PAINT_AND_PRESENTATION = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "paint-order",
  "opacity",
  "color",
  "clip-path",
  "clip-rule",
  "mask",
  "display",
  "visibility",
  "shape-rendering",
];
const DRAWN = ["id", "transform", ...PAINT_AND_PRESENTATION];
// A clip path, what it holds and a mask take neither a clip path nor a mask.
const UNCLIPPED = DRAWN.filter((name) => name !== "clip-path" && name !== "mask");

const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  svg: [
    "xmlns",
    "id",
    "viewBox",
    "width",
    "height",
    "preserveAspectRatio",
    ...PAINT_AND_PRESENTATION,
  ],
  g: DRAWN,
  defs: DRAWN,
  clipPath: [...UNCLIPPED, "clipPathUnits"],
  mask: [
    "id",
    ...UNCLIPPED.filter((name) => name !== "id" && name !== "transform"),
    "x",
    "y",
    "width",
    "height",
    "maskUnits",
    "maskContentUnits",
    "mask-type",
  ],
  path: [...DRAWN, "d"],
  rect: [...DRAWN, "x", "y", "width", "height", "rx", "ry"],
  circle: [...DRAWN, "cx", "cy", "r"],
  ellipse: [...DRAWN, "cx", "cy", "rx", "ry"],
  line: [...DRAWN, "x1", "y1", "x2", "y2"],
  polyline: [...DRAWN, "points"],
  polygon: [...DRAWN, "points"],
  use: [...DRAWN, "href", "x", "y", "width", "height"],
  linearGradient: [
    "id",
    "href",
    "x1",
    "y1",
    "x2",
    "y2",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
  ],
  radialGradient: [
    "id",
    "href",
    "cx",
    "cy",
    "r",
    "fx",
    "fy",
    "fr",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
  ],
  stop: ["id", "offset", "stop-color", "stop-opacity"],
  title: [],
  desc: [],
};

// Where each element may stand: the children each parent may hold.
const CONTAINER_CHILDREN = [
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  "linearGradient",
  "radialGradient",
  "clipPath",
  "mask",
  "title",
  "desc",
];
const SHAPE_CHILDREN = ["title", "desc"];
const CLIP_CHILDREN = [
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  "title",
  "desc",
];
const CHILDREN: Readonly<Record<string, readonly string[]>> = {
  svg: CONTAINER_CHILDREN,
  g: CONTAINER_CHILDREN,
  defs: CONTAINER_CHILDREN,
  clipPath: CLIP_CHILDREN,
  mask: CONTAINER_CHILDREN,
  path: SHAPE_CHILDREN,
  rect: SHAPE_CHILDREN,
  circle: SHAPE_CHILDREN,
  ellipse: SHAPE_CHILDREN,
  line: SHAPE_CHILDREN,
  polyline: SHAPE_CHILDREN,
  polygon: SHAPE_CHILDREN,
  use: SHAPE_CHILDREN,
  linearGradient: ["stop"],
  radialGradient: ["stop"],
  stop: [],
  title: [],
  desc: [],
};

const TEXT_HOLDERS = new Set(["title", "desc"]);
const ID = "[A-Za-z_][A-Za-z0-9_-]*";
// A number as the sanitiser keeps it, written as it was given: an optional sign, digits with a
// fraction after a point or a fraction alone, and an exponent of at most three digits.
const NUMBER = "[+-]?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?";
const NUMBER_ONLY = new RegExp(`^${NUMBER}$`);
const UNITS = "px|mm|cm|in|pt|pc";
const LENGTH = new RegExp(`^(${NUMBER})(%|${UNITS})?$`, "i");
const ABSOLUTE_LENGTH = new RegExp(`^(${NUMBER})(${UNITS})?$`, "i");
// White space with at most one comma, as between two numbers of a list.
const LIST_SEPARATOR = / +(?:, *)?|, */;
const COLOUR = /^(?:#[0-9a-f]{6}|[a-z]+|currentColor)$/;
const REFERENCE_URL = new RegExp(`^url\\(#(${ID})\\)$`);
const FRAGMENT = new RegExp(`^#(${ID})$`);
const ID_ONLY = new RegExp(`^${ID}$`);
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9A-Fa-f]{1,6});/;
const PATH_ARITY: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};
const TRANSFORM_ARITY: Readonly<Record<string, readonly number[]>> = {
  matrix: [6],
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
};

type Grammar = (value: string, element: string) => boolean;

/**
 * A number the sanitiser keeps: at most 25 characters, an exponent of at most 38 either way, and
 * fewer than seven digits before the point once the exponent is applied.
 */
function isNumber(value: string): boolean {
  if (value.length > 25 || !NUMBER_ONLY.test(value)) return false;
  const [mantissa = "", exponent = "0"] = value.replace(/^[+-]/, "").split(/[eE]/);
  if (exponent.replace(/^[+-]/, "").length > 3 || Math.abs(Number(exponent)) > 38) return false;
  const [whole = "", fraction = ""] = mantissa.split(".");
  const digits = (whole + fraction).replace(/^0+/, "");
  const leading =
    whole.replace(/^0+/, "").length || -(fraction.length - fraction.replace(/^0+/, "").length);
  return digits === "" || leading + Number(exponent) <= 6;
}

/**
 * A list of numbers, each after the last with white space and at most one comma between them, or
 * nothing where the next number cannot run on from it (`1.5.5`, `1-2`); `undefined` for any other.
 */
function numberList(value: string): string[] | undefined {
  const parts: string[] = [];
  const next = new RegExp(`^${NUMBER}`);
  let at = 0;
  while (at < value.length) {
    if (parts.length > 0) {
      const separator = / *(?:, *)?/.exec(value.slice(at))?.[0] ?? "";
      at += separator.length;
      if (at >= value.length) return undefined;
    }
    const match = next.exec(value.slice(at));
    if (match === null || !isNumber(match[0])) return undefined;
    parts.push(match[0]);
    at += match[0].length;
  }
  return parts;
}

const oneOf =
  (...choices: string[]): Grammar =>
  (value) =>
    choices.includes(value);

function length(nonNegative: boolean): Grammar {
  return (value) => {
    const match = LENGTH.exec(value);
    return (
      match !== null &&
      isNumber(match[1] ?? "") &&
      (!nonNegative || !/^-0*[.0-9]*[1-9]/.test(match[1] ?? ""))
    );
  };
}

// The root's size is positive, in pixels or an absolute unit.
const size: Grammar = (value, element) => {
  if (element !== "svg") return length(true)(value, element);
  const match = ABSOLUTE_LENGTH.exec(value);
  return match !== null && isNumber(match[1] ?? "") && Number(match[1]) > 0;
};

// A fraction, a percentage too, which Chromium clamps to 0 to 1.
function unitInterval(value: string): boolean {
  const match = /^(.*?)%?$/.exec(value);
  return isNumber(match?.[1] ?? "");
}

const PATH_COMMAND = /[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * Path data as Chromium reads it: a move first; between a command and its first number only white
 * space; between numbers white space with at most one comma; an arc's flags single digits that may
 * touch what follows; a comma after a command's last number only before the next command.
 */
function pathData(value: string): boolean {
  let at = 0;
  const spaces = (): void => {
    while (value[at] === " ") at += 1;
  };
  const separator = (): void => {
    spaces();
    if (value[at] === ",") at += 1;
    spaces();
  };
  const number = (): boolean => {
    const match = new RegExp(`^${NUMBER}`).exec(value.slice(at));
    if (match === null || !isNumber(match[0])) return false;
    at += match[0].length;
    return true;
  };
  let first = true;
  while (at < value.length) {
    const command = value[at] ?? "";
    if (!PATH_COMMAND.test(command) || (first && command.toLowerCase() !== "m")) return false;
    first = false;
    at += 1;
    const arity = PATH_ARITY[command.toLowerCase()] ?? 0;
    if (arity > 0) {
      for (;;) {
        for (let index = 0; index < arity; index += 1) {
          if (index === 0) spaces();
          else separator();
          if (arity === 7 && (index === 3 || index === 4)) {
            if (value[at] !== "0" && value[at] !== "1") return false;
            at += 1;
          } else if (!number()) return false;
        }
        const before = at;
        separator();
        if (new RegExp(`^${NUMBER}`).test(value.slice(at))) continue;
        if (!PATH_COMMAND.test(value[at] ?? "")) at = before;
        break;
      }
    }
    spaces();
  }
  return !first && !value.endsWith(" ");
}

function points(value: string): boolean {
  const parts = numberList(value);
  return parts !== undefined && parts.length >= 2 && parts.length % 2 === 0;
}

/** Functions separated by white space with at most one comma, each `name(numbers)`. */
function transform(value: string): boolean {
  if (/^[ ,]|[ ,]$/.test(value)) return false;
  const functions = value.match(/[A-Za-z]+ *\([^)]*\)/g);
  if (functions === null || functions.length > 16) return false;
  const between = value.split(/[A-Za-z]+ *\([^)]*\)/);
  if (
    !between.every((gap, index) =>
      index === 0 || index === between.length - 1 ? gap === "" : /^ *(?:, *)?$/.test(gap),
    )
  )
    return false;
  return functions.every((call) => {
    const open = call.indexOf("(");
    const name = call.slice(0, open).trimEnd();
    const arities = Object.hasOwn(TRANSFORM_ARITY, name) ? TRANSFORM_ARITY[name] : undefined;
    const inside = call.slice(open + 1, -1).replace(/^ +| +$/g, "");
    const values = numberList(inside);
    return values !== undefined && arities?.includes(values.length) === true;
  });
}

const paint: Grammar = (value) =>
  value === "none" || REFERENCE_URL.test(value) || COLOUR.test(value);
const reference: Grammar = (value) => value === "none" || REFERENCE_URL.test(value);

const GRAMMARS: Readonly<Record<string, Grammar>> = {
  id: (value) => ID_ONLY.test(value),
  d: pathData,
  points,
  x: length(false),
  y: length(false),
  width: size,
  height: size,
  rx: length(true),
  ry: length(true),
  cx: length(false),
  cy: length(false),
  r: length(true),
  fx: length(false),
  fy: length(false),
  fr: length(true),
  x1: length(false),
  y1: length(false),
  x2: length(false),
  y2: length(false),
  viewBox: (value) => {
    const parts = numberList(value);
    return parts?.length === 4 && Number(parts[2]) > 0 && Number(parts[3]) > 0;
  },
  preserveAspectRatio: (value) => /^x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: meet)?$/.test(value),
  transform,
  gradientTransform: transform,
  offset: unitInterval,
  href: (value) => FRAGMENT.test(value),
  "clip-path": reference,
  mask: reference,
  fill: paint,
  stroke: paint,
  color: (value) => COLOUR.test(value),
  "stop-color": (value) => COLOUR.test(value),
  "fill-opacity": unitInterval,
  "stroke-opacity": unitInterval,
  "stop-opacity": unitInterval,
  opacity: unitInterval,
  "fill-rule": oneOf("nonzero", "evenodd"),
  "clip-rule": oneOf("nonzero", "evenodd"),
  "stroke-width": length(true),
  "stroke-linecap": oneOf("butt", "round", "square"),
  "stroke-linejoin": oneOf("miter", "round", "bevel"),
  "stroke-miterlimit": (value) => isNumber(value) && Number(value) >= 1,
  "stroke-dasharray": (value) => {
    if (value === "none") return true;
    const parts = value.split(LIST_SEPARATOR);
    return (
      !/^[ ,]|[ ,]$/.test(value) &&
      parts.length <= 64 &&
      parts.every((part) => {
        const match = ABSOLUTE_LENGTH.exec(part);
        return match !== null && length(true)(part, "path");
      })
    );
  },
  "stroke-dashoffset": length(false),
  "paint-order": (value) =>
    value === "normal" ||
    (/^(?:fill|stroke|markers)(?: (?:fill|stroke|markers)){0,2}$/.test(value) &&
      new Set(value.split(" ")).size === value.split(" ").length),
  display: oneOf("inline", "none"),
  visibility: oneOf("visible", "hidden", "collapse"),
  "shape-rendering": oneOf("auto", "optimizeSpeed", "crispEdges", "geometricPrecision"),
  gradientUnits: oneOf("userSpaceOnUse", "objectBoundingBox"),
  spreadMethod: oneOf("pad", "reflect", "repeat"),
  clipPathUnits: oneOf("userSpaceOnUse", "objectBoundingBox"),
  maskUnits: oneOf("userSpaceOnUse", "objectBoundingBox"),
  maskContentUnits: oneOf("userSpaceOnUse", "objectBoundingBox"),
  "mask-type": oneOf("luminance", "alpha"),
};

const BASIC_SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

/** What a clip path holds: shapes drawn in it, and the ids its uses point at. */
interface ClipContent {
  shapes: number;
  readonly uses: string[];
}

/** What an element with an id is, for checking the uses in clip paths. */
interface Identified {
  readonly name: string;
  readonly clipped: boolean;
}

interface Reference {
  readonly id: string;
  readonly where: string;
}

function checkValue(
  element: string,
  name: string,
  value: string,
  problems: string[],
  references: Reference[],
): void {
  const where = `${element} ${name}`;
  if (/^on/i.test(name)) problems.push(`${where}: an event handler`);
  if (name === "xmlns") {
    if (element !== "svg" || value !== "http://www.w3.org/2000/svg")
      problems.push(`${where}: not the SVG namespace`);
    return;
  }
  const grammar = Object.hasOwn(GRAMMARS, name) ? GRAMMARS[name] : undefined;
  if (!grammar?.(value, element)) {
    problems.push(`${where}: a value outside its grammar`);
  }
  // A colour such as #d9d9d9 is also a fragment in form; only href holds one as a reference.
  const id =
    REFERENCE_URL.exec(value)?.[1] ?? (name === "href" ? FRAGMENT.exec(value)?.[1] : undefined);
  if (id !== undefined) references.push({ id, where });
}

interface StartTag {
  readonly name: string;
  readonly attributes: readonly (readonly [string, string])[];
  readonly selfClosing: boolean;
  readonly length: number;
}

function isLetter(character: string | undefined): boolean {
  return character !== undefined && /^[A-Za-z]$/.test(character);
}

function isNameCharacter(character: string | undefined): boolean {
  return character !== undefined && /^[A-Za-z0-9-]$/.test(character);
}

/** The end of the run of characters from `at` that each pass `test`. */
function runEnd(
  text: string,
  at: number,
  test: (character: string | undefined) => boolean,
): number {
  let end = at;
  while (test(text[end])) end += 1;
  return end;
}

/**
 * A start tag exactly as the sanitiser writes one, read character by character: `<`, a name of
 * letters, then any number of one space, a name (a letter, then letters, digits and hyphens), `="`,
 * a value with no `"`, `<`, `>` or `&`, and `"`; then an optional `/` and `>`. Anything else, white
 * space of another kind or amount included, is no tag.
 */
function readStartTag(text: string, at: number): StartTag | undefined {
  if (text[at] !== "<") return undefined;
  const nameEnd = runEnd(text, at + 1, isLetter);
  if (nameEnd === at + 1) return undefined;
  const attributes: [string, string][] = [];
  let position = nameEnd;
  while (text[position] === " ") {
    if (!isLetter(text[position + 1])) return undefined;
    const attributeEnd = runEnd(text, position + 2, isNameCharacter);
    if (text[attributeEnd] !== "=" || text[attributeEnd + 1] !== '"') return undefined;
    const valueEnd = runEnd(
      text,
      attributeEnd + 2,
      (character) => character !== undefined && !'"<>&'.includes(character),
    );
    if (text[valueEnd] !== '"') return undefined;
    attributes.push([
      text.slice(position + 1, attributeEnd),
      text.slice(attributeEnd + 2, valueEnd),
    ]);
    position = valueEnd + 1;
  }
  const selfClosing = text[position] === "/";
  if (selfClosing) position += 1;
  if (text[position] !== ">") return undefined;
  return {
    name: text.slice(at + 1, nameEnd),
    attributes,
    selfClosing,
    length: position + 1 - at,
  };
}

/** An end tag exactly as the sanitiser writes one: `</`, a name of letters, `>`. */
function readEndTag(text: string, at: number): { name: string; length: number } | undefined {
  if (text[at] !== "<" || text[at + 1] !== "/") return undefined;
  const nameEnd = runEnd(text, at + 2, isLetter);
  if (nameEnd === at + 2 || text[nameEnd] !== ">") return undefined;
  return { name: text.slice(at + 2, nameEnd), length: nameEnd + 1 - at };
}

/** Every way the text breaks the rules for sanitised output; empty when it keeps them all. */
export function findSanitisedSvgProblems(svg: string): string[] {
  const problems: string[] = [];
  if (!svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
    problems.push("does not start with the SVG root");
  if (svg.includes("<!")) problems.push("holds <!");
  if (svg.includes("<?")) problems.push("holds <?");
  const open: string[] = [];
  const ids = new Set<string>();
  const references: Reference[] = [];
  let roots = 0;
  let position = 0;
  const clips: ClipContent[] = [];
  const identified = new Map<string, Identified>();
  while (position < svg.length) {
    if (svg.startsWith("</", position)) {
      const end = readEndTag(svg, position);
      if (end === undefined || open.pop() !== end.name) {
        problems.push(`a stray or mismatched end tag at ${String(position)}`);
        break;
      }
      position += end.length;
      continue;
    }
    if (svg.startsWith("<", position)) {
      const start = readStartTag(svg, position);
      if (start === undefined) {
        problems.push(`a malformed tag at ${String(position)}`);
        break;
      }
      const name = start.name;
      if (open.length === 0) roots += 1;
      const parent = open.at(-1);
      if (parent === undefined && name !== "svg") problems.push(`a ${name} root`);
      if (parent !== undefined) {
        const allowedChildren = Object.hasOwn(CHILDREN, parent) ? CHILDREN[parent] : undefined;
        if (!allowedChildren?.includes(name)) problems.push(`${name} inside ${parent}`);
      }
      const allowed = Object.hasOwn(ALLOWED, name) ? ALLOWED[name] : undefined;
      if (allowed === undefined) problems.push(`the element ${name}`);
      const seen = new Set<string>();
      for (const [attribute, value] of start.attributes) {
        if (seen.has(attribute)) problems.push(`${name}: ${attribute} twice`);
        seen.add(attribute);
        if (!allowed?.includes(attribute)) problems.push(`${name}: the attribute ${attribute}`);
        if (
          (parent === "clipPath" || name === "clipPath") &&
          (attribute === "clip-path" || attribute === "mask")
        )
          problems.push(`${name}: the attribute ${attribute} on or inside a clip path`);
        checkValue(name, attribute, value, problems, references);
        if (attribute === "id") {
          if (ids.has(value)) problems.push(`the id ${value} twice`);
          ids.add(value);
        }
      }
      const attributes = new Map(start.attributes);
      if (name === "use" && !attributes.has("href")) problems.push("a use with no reference");
      const id = attributes.get("id");
      if (id !== undefined) identified.set(id, { name, clipped: attributes.has("clip-path") });
      if (name === "clipPath") clips.push({ shapes: 0, uses: [] });
      const clip = clips.at(-1);
      if (parent === "clipPath" && clip !== undefined && name !== "title" && name !== "desc") {
        clip.shapes += 1;
        const href = attributes.get("href");
        if (name === "use" && href !== undefined) clip.uses.push(href.slice(1));
      }
      if (name === "svg" && open.length === 0 && !seen.has("viewBox"))
        problems.push("a root without viewBox");
      if (!start.selfClosing) open.push(name);
      position += start.length;
      continue;
    }
    const next = svg.indexOf("<", position);
    const text = svg.slice(position, next === -1 ? svg.length : next);
    const holder = open.at(-1);
    if (holder === undefined || !TEXT_HOLDERS.has(holder))
      problems.push(`text outside a title or desc at ${String(position)}`);
    if (text.includes(">")) problems.push("a raw > in text");
    for (let index = text.indexOf("&"); index !== -1; index = text.indexOf("&", index + 1)) {
      if (!ENTITY.test(text.slice(index)))
        problems.push(`an & that is not a predefined entity or a character reference`);
    }
    position += text.length;
  }
  if (open.length > 0) problems.push("unclosed elements");
  if (roots !== 1) problems.push(`${String(roots)} root elements`);
  // A clip path of more than one shape, or of one clipped in turn, makes a renderer combine shapes;
  // the sanitiser writes those as masks.
  for (const clip of clips) {
    if (clip.shapes > 1) problems.push("a clip path of more than one shape");
    for (const id of clip.uses) {
      const target = identified.get(id);
      if (target !== undefined && !BASIC_SHAPES.has(target.name))
        problems.push(`a use in a clip path of a ${target.name}`);
      if (target?.clipped === true) problems.push("a use in a clip path of a clipped shape");
    }
  }
  for (const target of references) {
    if (!ids.has(target.id)) problems.push(`${target.where}: a reference to a missing id`);
  }
  return problems;
}
