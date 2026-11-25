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

// The CSP demo page shares this script and has no table.
if (projects && pager && summary) {
  pager.addEventListener("idgPageChange", (event) => {
    showPage(event.detail.page);
  });

  projects.addEventListener("idgSort", () => {
    showPage(pager.page);
  });

  showPage(1);
}

// The brand section of index.html. A page gets these from `parseBrandKit` and `generateBrandTheme`:
// a logo is the SVG text exactly as the logo sanitiser returned it, and the swatches take a theme's
// colours (a few roles are enough). The logo is an image of a data URL, so only a page whose policy
// allows `img-src data:` shows it; csp-demo.html has no such section.
const brandLogo = document.getElementById("brand-demo-logo");
if (brandLogo) {
  brandLogo.logo =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><title>Harbour Lights</title><path d="M14 36h12l-3 -26h-6z" fill="#1b2a4a"/><rect x="16" y="4" width="8" height="6" rx="1" fill="#f4c430"/><rect x="50" y="14" width="64" height="6" rx="3" fill="#1b2a4a"/><rect x="50" y="24" width="40" height="6" rx="3" fill="#1b2a4a"/></svg>';
  document.getElementById("brand-demo-mark").logo =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="20" fill="#1b2a4a"/><rect x="16" y="7" width="8" height="5" rx="1" fill="#f4c430"/></svg>';
  document.getElementById("brand-demo-swatches").theme = {
    light: {
      color: {
        bg: { $value: "#f7f8fb" },
        text: { $value: "#161b2b" },
        accent: { $value: "#f4c430" },
        "on-accent": { $value: "#1b2a4a" },
      },
    },
    dark: {
      color: {
        bg: { $value: "#0c1222" },
        text: { $value: "#eef1f8" },
        accent: { $value: "#f4c430" },
        "on-accent": { $value: "#1b2a4a" },
      },
    },
  };
}
