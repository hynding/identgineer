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
// A number as the sanitiser writes it: no sign on zero, no leading or trailing zeros, no
// exponent, at most six digits on either side of the point.
const NUMBER = "-?(?:0|[1-9][0-9]{0,5})(?:\\.[0-9]{0,5}[1-9])?";
const NUMBER_ONLY = new RegExp(`^${NUMBER}$`);
const LENGTH = new RegExp(`^(${NUMBER})(%|mm|cm|in|pt|pc)?$`);
const ABSOLUTE_LENGTH = new RegExp(`^(${NUMBER})(mm|cm|in|pt|pc)?$`);
const COLOUR = /^(?:#[0-9a-f]{6}|[a-z]+|currentColor)$/;
const REFERENCE_URL = new RegExp(`^url\\(#(${ID})\\)$`);
const FRAGMENT = new RegExp(`^#(${ID})$`);
const ID_ONLY = new RegExp(`^${ID}$`);
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9A-Fa-f]{1,6});/;
const START_TAG = /^<([A-Za-z]+)((?: [A-Za-z][A-Za-z0-9-]*="[^"<>&]*")*)(\/?)>/;
const ATTRIBUTE = / ([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/g;
const END_TAG = /^<\/([A-Za-z]+)>/;
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

const isNumber = (value: string): boolean => NUMBER_ONLY.test(value);
const numbers = (value: string): string[] => (value === "" ? [] : value.split(" "));
const oneOf =
  (...choices: string[]): Grammar =>
  (value) =>
    choices.includes(value);

function length(nonNegative: boolean): Grammar {
  return (value) => {
    const match = LENGTH.exec(value);
    return match !== null && (!nonNegative || Number(match[1]) >= 0);
  };
}

// The root's size is in pixels, written bare, and never zero.
const size: Grammar = (value, element) =>
  element === "svg" ? isNumber(value) && Number(value) > 0 : length(true)(value, element);

function unitInterval(value: string): boolean {
  return isNumber(value) && Number(value) >= 0 && Number(value) <= 1;
}

function pathData(value: string): boolean {
  const segments = value.match(/[A-Za-z][^A-Za-z]*/g);
  if (segments?.join("") !== value) return false;
  return segments.every((segment, index) => {
    const command = segment.charAt(0);
    const arity = PATH_ARITY[command.toLowerCase()];
    if (arity === undefined || (index === 0 && command.toLowerCase() !== "m")) return false;
    const values = numbers(segment.slice(1));
    if (arity === 0) return values.length === 0;
    if (values.length === 0 || values.length % arity !== 0 || !values.every(isNumber)) return false;
    // An arc's fourth and fifth numbers are flags.
    return (
      arity !== 7 ||
      values.every((part, position) => position % 7 < 3 || position % 7 > 4 || /^[01]$/.test(part))
    );
  });
}

function points(value: string): boolean {
  return value
    .split(" ")
    .every((pair) => /^[^,]+,[^,]+$/.test(pair) && pair.split(",").every(isNumber));
}

function transform(value: string): boolean {
  const functions = value.match(/[A-Za-z]+\([^)]*\)/g);
  if (functions?.join(" ") !== value) return false;
  return functions.every((call) => {
    const open = call.indexOf("(");
    const name = call.slice(0, open);
    const arities = Object.hasOwn(TRANSFORM_ARITY, name) ? TRANSFORM_ARITY[name] : undefined;
    const values = numbers(call.slice(open + 1, -1));
    return arities?.includes(values.length) === true && values.every(isNumber);
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
    const parts = numbers(value);
    return (
      parts.length === 4 && parts.every(isNumber) && Number(parts[2]) > 0 && Number(parts[3]) > 0
    );
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
  "stroke-dasharray": (value) =>
    value === "none" ||
    numbers(value).every((part) => {
      const match = ABSOLUTE_LENGTH.exec(part);
      return match !== null && Number(match[1]) >= 0;
    }),
  "stroke-dashoffset": length(false),
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
    const rest = svg.slice(position);
    if (rest.startsWith("</")) {
      const end = END_TAG.exec(rest);
      if (!end?.[1] || open.pop() !== end[1]) {
        problems.push(`a stray or mismatched end tag at ${String(position)}`);
        break;
      }
      position += end[0].length;
      continue;
    }
    if (rest.startsWith("<")) {
      const start = START_TAG.exec(rest);
      const name = start?.[1];
      if (!start || name === undefined) {
        problems.push(`a malformed tag at ${String(position)}`);
        break;
      }
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
      for (const [, attribute = "", value = ""] of (start[2] ?? "").matchAll(ATTRIBUTE)) {
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
      const attributes = new Map(
        [...(start[2] ?? "").matchAll(ATTRIBUTE)].map(([, key = "", value = ""]) => [key, value]),
      );
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
      if (start[3] !== "/") open.push(name);
      position += start[0].length;
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
