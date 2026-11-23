import type { BootstrapConfig } from "./bootstrap-config.ts";

/**
 * The script is written already minified because the repository has no minifier and the page
 * should not need one: it is a few short statements, joined without whitespace.
 *
 * It must run in `<head>` before first paint and must never throw, so every read is guarded.
 * Nothing it reads is trusted: a value is applied only if `indexOf` finds it, by strict
 * equality, in the embedded allowlist, which also rules out non-strings, other case,
 * whitespace, prototype keys and long input. `"system"` removes `data-scheme`.
 * It is ES5 on purpose (`var`, `function`), which is safely inside ES2017.
 */
const STATEMENTS = [
  "(function(){",
  "try{",
  "var c=CONFIG;",
  "var d=document.documentElement,q,s,r;",
  "try{q=new URLSearchParams(location.search)}catch(e){}",
  "try{r=localStorage.getItem(c.k);",
  'if(typeof r=="string"&&r.length<=c.m)s=JSON.parse(r)}catch(e){}',
  "c.a.forEach(function(a){",
  "var v=q&&q.get(c.p+a[0]);",
  "if(a[2].indexOf(v)<0)v=s&&s[a[0]];",
  "if(a[2].indexOf(v)<0)return;",
  'v=="system"?d.removeAttribute(a[1]):d.setAttribute(a[1],v)',
  "})",
  "}catch(e){}",
  "})();",
];

export function buildBootstrapSource(config: BootstrapConfig): string {
  return STATEMENTS.join("").replace("CONFIG", JSON.stringify(config));
}
