// A component of another library that draws an idg-menu in its own shadow root and forwards its
// children to the menu through a slot, as a composite such as an account menu does. An external
// module, so it runs under the strict CSP, and it builds nodes with the DOM only.
class ForwardMenu extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const menu = document.createElement("idg-menu");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.slot = "trigger";
    trigger.id = "forward-menu-trigger";
    trigger.textContent = "Account";
    const own = document.createElement("idg-menu-item");
    own.setAttribute("value", "own");
    own.textContent = "Own item";
    menu.append(trigger, own, document.createElement("slot"));
    root.append(menu);
  }
}

customElements.define("forward-menu", ForwardMenu);
