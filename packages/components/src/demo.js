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

// Pages the projects table four rows at a time. The table sorts all of its rows, and showing a page
// is only a matter of which of them are hidden, so a sort is followed by showing the page again.
const PAGE_SIZE = 4;
const projects = document.getElementById("projects-table");
const pager = document.getElementById("projects-pager");
const summary = document.getElementById("projects-summary");

function showPage(page) {
  const rows = Array.from(projects.querySelectorAll("tbody tr"));
  rows.forEach((row, index) => {
    row.hidden = Math.floor(index / PAGE_SIZE) + 1 !== page;
  });
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, rows.length);
  summary.textContent = `Showing ${String(first)} to ${String(last)} of ${String(rows.length)} projects`;
}

pager.addEventListener("idgPageChange", (event) => {
  showPage(event.detail.page);
});

projects.addEventListener("idgSort", () => {
  showPage(pager.page);
});

showPage(1);
