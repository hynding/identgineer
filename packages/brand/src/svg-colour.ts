import { trimXmlWhitespace, XML_WHITESPACE } from "./svg-characters.ts";

// The CSS named colours. A name is kept as its lower-case keyword: it is a constant from this
// list, never the input.
const NAMED_COLOURS: ReadonlySet<string> = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
    "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
    "yellowgreen transparent"
  ).split(" "),
);

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// rgb() with three integers or three percentages, separated by commas or by spaces.
function rgbPattern(channel: string): RegExp {
  const S = XML_WHITESPACE;
  const separator = `${S}*(?:,${S}*|${S})`;
  return new RegExp(
    `^rgb\\(${S}*${channel}${separator}${channel}${separator}${channel}${S}*\\)$`,
    "i",
  );
}
const RGB_INTEGERS = rgbPattern("(\\d{1,3})");
const RGB_PERCENTAGES = rgbPattern("(\\d{1,3}(?:\\.\\d{1,4})?)%");
const MAX_COLOUR_LENGTH = 64;

function hex(channels: readonly number[]): string {
  return `#${channels
    .map((channel) =>
      Math.min(255, Math.max(0, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * `#rgb`, `#rrggbb`, `rgb()` and the named colours, written back as `#rrggbb` in lower case or as
 * the lower-case keyword; `currentColor` as itself. Anything else (alpha, `hsl()`, system colours,
 * functions of any other name) is `undefined`.
 */
export function parseSvgColour(input: string): string | undefined {
  const value = trimXmlWhitespace(input);
  if (value.length > MAX_COLOUR_LENGTH) return undefined;
  const lower = value.toLowerCase();
  if (lower === "currentcolor") return "currentColor";
  if (NAMED_COLOURS.has(lower)) return lower;
  const short = HEX.exec(value)?.[1];
  if (short !== undefined) {
    const full = short.length === 3 ? short.replace(/./g, "$&$&") : short;
    return `#${full.toLowerCase()}`;
  }
  const integers = RGB_INTEGERS.exec(value);
  if (integers) return hex(integers.slice(1).map(Number));
  const percentages = RGB_PERCENTAGES.exec(value);
  if (percentages) return hex(percentages.slice(1).map((part) => (Number(part) * 255) / 100));
  return undefined;
}
