// An independent check of what the SVG logo sanitiser may emit, used by the tests. It shares no
// code with the sanitiser (its own tokeniser, its own copy of the allowlist and its own value
// rules), so a mistake in one is not repeated in the other. It returns every problem it finds.

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
  "vector-effect",
  "shape-rendering",
];
const DRAWN = ["id", "transform", ...PAINT_AND_PRESENTATION];

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
  clipPath: [...DRAWN, "clipPathUnits"],
  mask: [...DRAWN, "x", "y", "width", "height", "maskUnits", "maskContentUnits", "mask-type"],
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

const TEXT_HOLDERS = new Set(["title", "desc"]);
const ID = "[A-Za-z_][A-Za-z0-9_-]*";
const VALUE_CHARACTERS = /^[A-Za-z0-9 .,#()%-]*$/;
const SCHEME = /[A-Za-z][A-Za-z0-9+.-]*:/;
const FUNCTION = /([A-Za-z-]*)\(/g;
const ALLOWED_FUNCTIONS = new Set([
  "url",
  "matrix",
  "translate",
  "scale",
  "rotate",
  "skewX",
  "skewY",
]);
const URL_USE = /url\(([^)]*)\)/g;
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9A-Fa-f]{1,6});/;
const START_TAG = /^<([A-Za-z]+)((?: [A-Za-z][A-Za-z0-9-]*="[^"<>&]*")*)(\/?)>/;
const ATTRIBUTE = / ([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/g;
const END_TAG = /^<\/([A-Za-z]+)>/;

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
  if (!VALUE_CHARACTERS.test(value)) problems.push(`${where}: a character outside the value set`);
  if (SCHEME.test(value)) problems.push(`${where}: a URL scheme`);
  for (const [, name] of value.matchAll(FUNCTION)) {
    if (!ALLOWED_FUNCTIONS.has(name ?? "")) problems.push(`${where}: the function ${name ?? ""}()`);
  }
  for (const [, inside] of value.matchAll(URL_USE)) {
    const match = new RegExp(`^#(${ID})$`).exec(inside ?? "");
    if (!match?.[1]) problems.push(`${where}: a url() that is not url(#id)`);
    else references.push({ id: match[1], where });
  }
  if (name === "href") {
    const match = new RegExp(`^#(${ID})$`).exec(value);
    if (!match?.[1]) problems.push(`${where}: an href that is not #id`);
    else references.push({ id: match[1], where });
  }
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
      if (parent !== undefined && TEXT_HOLDERS.has(parent))
        problems.push(`${name} inside ${parent}`);
      if (name === "svg" && open.length > 0) problems.push("a nested svg");
      const allowed = Object.hasOwn(ALLOWED, name) ? ALLOWED[name] : undefined;
      if (allowed === undefined) problems.push(`the element ${name}`);
      const seen = new Set<string>();
      for (const [, attribute = "", value = ""] of (start[2] ?? "").matchAll(ATTRIBUTE)) {
        if (seen.has(attribute)) problems.push(`${name}: ${attribute} twice`);
        seen.add(attribute);
        if (!allowed?.includes(attribute)) problems.push(`${name}: the attribute ${attribute}`);
        checkValue(name, attribute, value, problems, references);
        if (attribute === "id") {
          if (ids.has(value)) problems.push(`the id ${value} twice`);
          ids.add(value);
        }
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
  for (const reference of references) {
    if (!ids.has(reference.id)) problems.push(`${reference.where}: a reference to a missing id`);
  }
  return problems;
}
