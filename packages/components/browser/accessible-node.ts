import type { Page } from "@playwright/test";

export interface AccessibleNode {
  role: string;
  name: string;
  description: string;
  properties: Record<string, unknown>;
}

interface AxValue {
  value?: string | number | boolean;
}

interface AxNode {
  role?: AxValue;
  name?: AxValue;
  description?: AxValue;
  properties?: { name: string; value: AxValue }[];
}

/**
 * What the browser itself computes for an element inside a shadow root: its role, accessible name
 * and description, read from the accessibility tree through the DevTools protocol rather than
 * inferred from attributes. `inner` is a selector inside the host's shadow root.
 */
export async function accessibleNode(
  page: Page,
  hostId: string,
  inner: string,
): Promise<AccessibleNode> {
  const client = await page.context().newCDPSession(page);
  try {
    const { result } = await client.send("Runtime.evaluate", {
      expression: `document.getElementById(${JSON.stringify(hostId)}).shadowRoot.querySelector(${JSON.stringify(inner)})`,
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
      properties: Object.fromEntries((ax.properties ?? []).map((p) => [p.name, p.value.value])),
    };
  } finally {
    await client.detach();
  }
}
