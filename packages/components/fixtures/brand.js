// Hands the brand components their data, as a page would after reading a brand kit: the logos, kits and
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

for (const element of document.querySelectorAll("[data-kit-source]")) {
  element.kit = data.kits[element.dataset.kitSource];
}
// What an export is given as texts, as a page would after emitting them itself.
for (const element of document.querySelectorAll("[data-export-source]")) {
  Object.assign(element, data.exports[element.dataset.exportSource]);
}
if (document.querySelector("#export-altered")) {
  document.querySelector("#export-altered").theme = data.alteredTheme;
}

await Promise.all(
  [
    ...document.querySelectorAll(
      "idg-brand-logo, idg-brand-swatches, idg-brand-guidelines, idg-brand-export",
    ),
  ].map((element) => element.componentOnReady()),
);
document.documentElement.dataset.brandReady = "";
