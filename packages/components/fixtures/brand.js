// Hands the brand components their data, as a page would after reading a brand kit: the logos and
// the generated themes come from /fixtures/brand-data.json, which the browser test answers. The
// values are set as properties, which is how a page gives a component an object or a long text.
const response = await fetch("/fixtures/brand-data.json");
const data = await response.json();

for (const element of document.querySelectorAll("[data-logo]")) {
  const [kit, field] = element.dataset.logo.split(".");
  element.logo = data[kit][field];
}
for (const element of document.querySelectorAll("[data-theme-source]")) {
  element.theme = data.themes[element.dataset.themeSource];
}

await Promise.all(
  [...document.querySelectorAll("idg-brand-logo, idg-brand-swatches")].map((element) =>
    element.componentOnReady(),
  ),
);
document.documentElement.dataset.brandReady = "";
