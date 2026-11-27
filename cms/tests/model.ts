import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The shapes below are the parts of camis' IR, roles and config schemas these tests read. They are
// restated rather than imported because camis is not an npm package, and CI must run without it.

export type Expression =
  | { kind: "lit"; value: string | number | boolean | null }
  | { kind: "var"; name: string }
  | { kind: "eq" | "ne"; left: Expression; right: Expression }
  | { kind: "and" | "or"; args: Expression[] }
  | { kind: "not"; arg: Expression };

export type Action = "create" | "read" | "update" | "delete" | "publish";

export interface Grant {
  contentType: string;
  actions: Action[];
  condition?: Expression;
  assign?: Record<string, "user.id">;
  fieldRules?: unknown[];
}

export interface Role {
  name: string;
  description?: string;
  admin?: boolean;
  grants: Grant[];
  endpoints?: string[];
  services?: string[];
}

export interface RolesFile {
  defaultRole?: string;
  roles: Role[];
}

export interface Field {
  type: string;
  name: string;
  required?: boolean;
  unique?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  values?: string[];
  default?: string | number | boolean;
  relationKind?: string;
  target?: string;
  allowedTypes?: string[];
  private?: boolean;
  names?: { api?: string };
  inverse?: string;
  inverseNames?: { api: string };
  component?: string;
  repeatable?: boolean;
}

export interface ContentType {
  name: string;
  kind: "collection" | "single";
  builtin?: "user" | "file";
  fields: Field[];
  options?: { apiActions?: string[]; publicApiActions?: string[]; draftPublish?: boolean };
}

export interface Endpoint {
  name: string;
  contentType: string;
  method: string;
  path: string;
  public?: boolean;
  throttle?: { perMinute: number };
  maxBodyBytes?: number;
  accepts?: string[];
  crossOrigin?: { headers: string[] };
}

export interface Hook {
  name: string;
  trigger: string;
  contentType: string;
  input: { name: string; type: string }[];
  output: { name: string; type: string }[];
}

export interface RouteHook {
  name: string;
  contentType: string;
  actions?: string[];
}

export interface IrDocument {
  version: 1;
  contentTypes: ContentType[];
  components: { name: string; fields: Field[] }[];
  hooks?: Hook[];
  middlewares?: RouteHook[];
  policies?: RouteHook[];
  endpoints?: Endpoint[];
}

export interface TargetConfig {
  target: string;
  out: string;
  projectName?: string;
  apiStyle?: string;
  storageLayout?: string;
}

export interface ProjectConfig {
  ir: string;
  roles?: string;
  protected?: string;
  targets: TargetConfig[];
}

const CMS = new URL("../", import.meta.url);

export const readCmsText = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, CMS)), "utf8");

const readCmsJson = (path: string): unknown => JSON.parse(readCmsText(path));

export const loadIr = (): IrDocument => readCmsJson("camis.json") as IrDocument;
export const loadRoles = (): RolesFile => readCmsJson("roles.json") as RolesFile;
export const loadConfig = (): ProjectConfig => readCmsJson("camis.config.json") as ProjectConfig;

export const roleNamed = (file: RolesFile, name: string): Role => {
  const role = file.roles.find((r) => r.name === name);
  if (role === undefined) throw new Error(`roles.json has no "${name}" role`);
  return role;
};

export const contentTypeNamed = (ir: IrDocument, name: string): ContentType => {
  const contentType = ir.contentTypes.find((ct) => ct.name === name);
  if (contentType === undefined) throw new Error(`camis.json has no "${name}" content type`);
  return contentType;
};

/** The ownership condition every owned type's grants must carry: `record.ownerId == user.id`. */
export const OWNER_CONDITION: Expression = {
  kind: "eq",
  left: { kind: "var", name: "record.ownerId" },
  right: { kind: "var", name: "user.id" },
};

/** The condition of the read-only grants on public brand kits: `record.isPublic == true`. */
export const PUBLIC_KIT_CONDITION: Expression = {
  kind: "eq",
  left: { kind: "var", name: "record.isPublic" },
  right: { kind: "lit", value: true },
};
