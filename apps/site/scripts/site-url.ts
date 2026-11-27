/** On a reserved domain, so a build that forgot the setting can never point at someone's site. */
export const PLACEHOLDER_SITE_URL = "https://identgineer.example/";

const SETTING = "IDG_SITE_URL";

function refuse(given: string, reason: string): never {
  throw new Error(`${SETTING} ${JSON.stringify(given)} ${reason}`);
}

/**
 * The site's public address, from the one build setting that names it: canonical links and Open
 * Graph URLs are built on it. It must be the root of an origin, because every link of the site is
 * root-relative.
 */
export function siteUrlFrom(environment: Readonly<Record<string, string | undefined>>): URL {
  const given = environment[SETTING] ?? "";
  if (given === "") return new URL(PLACEHOLDER_SITE_URL);
  let url: URL;
  try {
    url = new URL(given);
  } catch {
    return refuse(given, "is not an absolute URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    refuse(given, "must use https or http");
  }
  if (url.username !== "" || url.password !== "") {
    refuse(given, "must not hold a user name or password");
  }
  // `new URL` drops an empty `?` or `#`, so the text is checked as well as the parsed parts.
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || /[?#]/.test(given)) {
    refuse(given, "must be the root of its origin, such as https://identgineer.dev");
  }
  return url;
}
