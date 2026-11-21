function channels(color: string): [number, number, number] {
  const match = /rgba?\((\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/.exec(color);
  if (!match) throw new Error(`not an rgb colour: ${color}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance(color: string): number {
  const [red, green, blue] = channels(color).map((value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio between two computed `rgb()` colours. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}
