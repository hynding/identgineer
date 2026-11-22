// A component of another library that forwards its own children to an idg-switcher through a slot.
// An external module, so it runs under the strict CSP, and it builds nodes with the DOM only.
class ForwardItems extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const switcher = document.createElement("idg-switcher");
    switcher.setAttribute("limit", "3");
    switcher.append(document.createElement("slot"));
    root.append(switcher);
  }
}

customElements.define("forward-items", ForwardItems);
