// Hands each editor its kit and a fake store, as a page would hand it the object
// `createBrandKitStore` returns. The kits come from /fixtures/brand-data.json, which the browser test
// answers. The store answers what `window.__brandStore.plan` says, in order (a store answer by
// default), and records each call for the test to read back: the kit's fields, never sent anywhere.
const response = await fetch("/fixtures/brand-data.json");
const data = await response.json();

// What a server could put in an error's message: the editor must never show it.
const SERVER_MESSAGE = 'The server said <img src=x onerror="window.__pwned = 1">';

const calls = [];
const plan = [];
const held = [];
const saves = [];
let created = 0;

const fieldsOf = (kit) => ({
  id: kit.id,
  name: kit.name,
  tagline: kit.tagline ?? null,
  colors: kit.colors,
  typography: kit.typography,
  corners: kit.corners,
  tone: kit.tone,
  logo: kit.logo ?? null,
  mark: kit.mark ?? null,
});

function answer(kit, documentId) {
  const step = plan.shift() ?? "store";
  const stored = { ok: true, record: { documentId, isPublic: false, kit } };
  if (step === "hold") {
    return new Promise((resolve) => {
      held.push(() => {
        resolve(stored);
      });
    });
  }
  if (typeof step === "object" && step !== null) {
    return Promise.reject(Object.assign(new Error(SERVER_MESSAGE), step));
  }
  return Promise.resolve(stored);
}

const store = {
  create(kit) {
    calls.push({ operation: "create", kit: fieldsOf(kit) });
    created += 1;
    return answer(kit, `doc-${String(created)}`);
  },
  update(documentId, kit) {
    calls.push({ operation: "update", documentId, kit: fieldsOf(kit) });
    return answer(kit, documentId);
  },
};

window.__brandStore = {
  calls,
  plan,
  saves,
  release: () => {
    for (const resolve of held.splice(0)) resolve();
  },
};

document.addEventListener("idgSave", (event) => {
  saves.push({ editor: event.target.id, detail: event.detail });
});

for (const element of document.querySelectorAll("idg-brand-editor")) {
  element.store = store;
  if (element.dataset.kitSource) element.kit = data.kits[element.dataset.kitSource];
}

await Promise.all(
  [...document.querySelectorAll("idg-brand-editor")].map((element) => element.componentOnReady()),
);
document.documentElement.dataset.brandReady = "";
