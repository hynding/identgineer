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
    // The forwarded items sit in a group of this component's own, as an account menu's do.
    const group = document.createElement("idg-menu-group");
    group.setAttribute("label", "Yours");
    group.append(document.createElement("slot"));
    menu.append(trigger, own, group);
    root.append(menu);
  }
}

customElements.define("forward-menu", ForwardMenu);
