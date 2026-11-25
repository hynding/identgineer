// Renders every logo the test lists twice: as an <img> from its data URL, and inline, parsed by
// the page's HTML parser through innerHTML (a logo listed without markup is shown only as an image). A Trusted Types policy passes the markup on unchanged:
// the test is whether the markup itself is inert, so nothing here cleans it.
const policy = globalThis.trustedTypes?.createPolicy("logo-fixture", {
  createHTML: (markup) => markup,
});

const report = { violations: [], broken: [] };
globalThis.__logoReport = report;
document.addEventListener("securitypolicyviolation", (event) => {
  report.violations.push(`${event.violatedDirective} ${event.blockedURI}`);
});

async function render() {
  const response = await fetch("/fixtures/logos.json");
  const { logos } = await response.json();
  const images = document.getElementById("images");
  const inline = document.getElementById("inline");
  const decoded = logos.map(({ name, svg, dataUrl }) => {
    if (svg !== undefined) {
      const figure = document.createElement("div");
      figure.dataset.logo = name;
      figure.innerHTML = policy ? policy.createHTML(svg) : svg;
      inline.append(figure);
    }
    if (dataUrl === undefined) return Promise.resolve();
    const image = new Image();
    image.alt = name;
    image.src = dataUrl;
    images.append(image);
    return image.decode().then(
      () => {
        if (image.naturalWidth === 0) report.broken.push(name);
      },
      () => report.broken.push(name),
    );
  });
  await Promise.all(decoded);
  // Give anything a logo might have started (a load event, an animation) a moment to run.
  await new Promise((resolve) => setTimeout(resolve, 200));
  document.documentElement.dataset.rendered = String(logos.length);
}

render();
