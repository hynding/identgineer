// The layout buttons of the fixture. An external module, so it runs under the strict CSP. It only
// sets `data-layout` on the root, which is all a page has to do to change the layout.
const root = document.documentElement;
const buttons = Array.from(document.querySelectorAll("[data-set-layout]"));

function showPressed() {
  const current = root.dataset.layout ?? "top-bar";
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button.dataset.setLayout === current));
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    root.dataset.layout = button.dataset.setLayout;
  });
}

// Whoever changes the attribute, the buttons say which layout is showing.
new MutationObserver(showPressed).observe(root, {
  attributes: true,
  attributeFilter: ["data-layout"],
});
showPressed();
