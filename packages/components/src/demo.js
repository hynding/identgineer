// Wires the demo's overlays together, as a page script would. It is an external same-origin
// module, so it runs under the strict CSP of csp-demo.html, and it sets text only.
import { toast } from "/build/index.esm.js";

const dialog = document.getElementById("archive-dialog");
const menu = document.getElementById("studio-menu");

menu.addEventListener("idgSelect", (event) => {
  const { value } = event.detail;
  if (value === "archive") {
    void dialog.showModal();
    return;
  }
  toast({ title: value, variant: "success" });
});

for (const button of dialog.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => {
    void dialog.close(button.dataset.close);
  });
}

dialog.addEventListener("idgClose", (event) => {
  if (event.detail.returnValue !== "archive") return;
  toast({
    title: "Studio archived",
    description: "Projects are read-only until you restore it.",
    action: {
      label: "Undo",
      onSelect: () => {
        toast({ title: "Studio restored", variant: "info" });
      },
    },
  });
});
