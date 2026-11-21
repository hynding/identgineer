import type { Page } from "@playwright/test";

export interface AccessibleNode {
  role: string;
  name: string;
  description: string;
  /** The value of a control such as a progress bar, when the browser reports one. */
  value: string | number | boolean | undefined;
  properties: Record<string, unknown>;
  /** How many elements each relation (such as `controls` or `describedby`) points at. */
  relations: Record<string, number>;
}

interface AxValue {
  value?: string | number | boolean;
  relatedNodes?: unknown[];
}

interface AxNode {
  nodeId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
  ignored?: boolean;
  role?: AxValue;
  name?: AxValue;
  description?: AxValue;
  value?: AxValue;
  properties?: { name: string; value: AxValue }[];
}

/**
 * What the browser itself computes for an element inside a shadow root: its role, accessible name
 * and description, read from the accessibility tree through the DevTools protocol rather than
 * inferred from attributes. `inner` is a selector inside the host's shadow root, or `""` for the
 * element itself.
 */
export async function accessibleNode(
  page: Page,
  hostId: string,
  inner: string,
): Promise<AccessibleNode> {
  const client = await page.context().newCDPSession(page);
  try {
    const { result } = await client.send("Runtime.evaluate", {
      expression:
        inner === ""
          ? `document.getElementById(${JSON.stringify(hostId)})`
          : `document.getElementById(${JSON.stringify(hostId)}).shadowRoot.querySelector(${JSON.stringify(inner)})`,
    });
    if (!result.objectId) throw new Error(`no ${inner} inside #${hostId}`);
    const { node } = await client.send("DOM.describeNode", { objectId: result.objectId });
    const { nodes } = (await client.send("Accessibility.getPartialAXTree", {
      backendNodeId: node.backendNodeId,
      fetchRelatives: false,
    })) as { nodes: AxNode[] };
    const ax = nodes[0];
    if (!ax) throw new Error(`no accessibility node for ${inner} inside #${hostId}`);
    return {
      role: String(ax.role?.value ?? ""),
      name: String(ax.name?.value ?? ""),
      description: String(ax.description?.value ?? ""),
      value: ax.value?.value,
      properties: Object.fromEntries((ax.properties ?? []).map((p) => [p.name, p.value.value])),
      relations: Object.fromEntries(
        (ax.properties ?? [])
          .filter((p) => p.value.relatedNodes !== undefined)
          .map((p) => [p.name, p.value.relatedNodes?.length ?? 0]),
      ),
    };
  } finally {
    await client.detach();
  }
}

export interface AccessibleDescendant {
  role: string;
  name: string;
}

/**
 * Every node the browser exposes to assistive technology beneath a host, in tree order, taken from
 * the full accessibility tree. Nodes the browser leaves out of the tree (hidden, presentational) are
 * not listed, so it shows what a screen reader user would meet, shadow roots included.
 */
export async function accessibleDescendants(
  page: Page,
  hostId: string,
): Promise<AccessibleDescendant[]> {
  const client = await page.context().newCDPSession(page);
  try {
    const { result } = await client.send("Runtime.evaluate", {
      expression: `document.getElementById(${JSON.stringify(hostId)})`,
    });
    if (!result.objectId) throw new Error(`no element #${hostId}`);
    const { node } = await client.send("DOM.describeNode", { objectId: result.objectId });
    const { nodes } = (await client.send("Accessibility.getFullAXTree")) as { nodes: AxNode[] };
    const byId = new Map(nodes.map((candidate) => [candidate.nodeId, candidate]));
    const start = nodes.find((candidate) => candidate.backendDOMNodeId === node.backendNodeId);
    if (!start) throw new Error(`#${hostId} is not in the accessibility tree`);
    const found: AccessibleDescendant[] = [];
    const visit = (ax: AxNode): void => {
      for (const childId of ax.childIds ?? []) {
        const child = byId.get(childId);
        if (!child) continue;
        if (child.ignored !== true) {
          found.push({
            role: String(child.role?.value ?? ""),
            name: String(child.name?.value ?? ""),
          });
        }
        visit(child);
      }
    };
    visit(start);
    return found;
  } finally {
    await client.detach();
  }
}
