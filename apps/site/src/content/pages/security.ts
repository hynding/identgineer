import { bullets, code, h2, link, p, page, repository, sample, warning } from "../authoring.ts";

export const SECURITY = page({
  slug: "security",
  title: "Security notes",
  summary:
    "What the components, the identity client and the tracker do for a page's security, what they leave to your server, and how to report a flaw.",
  body: [
    h2("A strict policy"),
    p(
      "Every component runs under a content security policy with no inline script or style and no eval, and with Trusted Types required: nothing writes HTML from a string. Their browser tests run under this policy and fail on any violation:",
    ),
    sample(
      "text",
      "default-src 'self'; style-src 'self'; script-src 'self'; require-trusted-types-for 'script'",
      "The least the components need",
    ),
    p(
      "Add the CMS's origin to ",
      code("connect-src"),
      " for the identity client, and the collecting endpoint for the tracker. This site is stricter still: it loads nothing from any other origin, allows each component's inline style by its hash, and its build writes the policy for the deployment to send.",
    ),
    h2("Tokens and passwords"),
    bullets(
      "The access token lives in memory, and the refresh token in an HttpOnly cookie on backends that set one. The elements never see either: they call the client.",
      "No element writes to local storage, session storage, a cookie or IndexedDB. A browser test signs in, saves the profile and signs out with all four watched.",
      "A password lives only in the field it is typed into. It is read at submit, never kept, and the field is emptied once the server has judged it.",
      "No event carries a password, a token or an email address.",
    ),
    h2("What the browser cannot enforce"),
    warning(
      "Hiding is not protecting",
      "The session guard hides its content from a signed-out visitor, but the content is in the page all along. Put nothing in it the visitor may not see, and have the server refuse every protected request without a valid token, as the CMS's permissions do for its own API.",
    ),
    p(
      "The same holds for the dashboard: its components draw what a source gives them, and the source, your server, decides whose data that is.",
    ),
    h2("No hint that an account exists"),
    p(
      "A failed sign-in has one message for every cause, registration answers a taken address as it answers a new one, and a reset request confirms every address alike. Browser tests compare the markup and the accessibility tree of both cases character for character. When you translate the messages, keep each one fixed: never put an address or a name into it.",
    ),
    h2("Text from the public internet"),
    p(
      "Event names, paths and property values on a dashboard were typed by someone or sent by a page anywhere. They are drawn as text only: no value becomes a link, a source or a style, and control and invisible characters are replaced by a visible mark.",
    ),
    p(
      "A brand kit's logo is SVG, rebuilt by a dependency-free sanitiser from an allowlist of elements and attributes, with no script, handlers, external references or foreignObject, and limits on what drawing it may cost. It is shown only through an image element.",
    ),
    h2("Tracking"),
    bullets(
      "The write key ships in page source by design. It can only add events and identifies a site, not a person.",
      "The collecting server must check the origin, limit the rate, validate every batch and store nothing about the visitor's address or browser. The CMS does all four.",
      "Stored values are checked when they are read back, and anything malformed is thrown away.",
    ),
    h2("Reporting a vulnerability"),
    p(
      "Report it privately through ",
      link(
        "https://github.com/hynding/identgineer/security/advisories/new",
        "GitHub's security advisories",
      ),
      ", not in a public issue. Say which package and commit, how to reproduce it and what you expect it to allow. The project is pre-release, and only the latest commit on the main branch is supported.",
    ),
    p(
      "The full notes are in the repository: ",
      link(repository("docs/identity/security.md"), "the identity components"),
      ", ",
      link(repository("docs/consent/rules.md"), "the consent banner"),
      ", ",
      link(repository("docs/dashboard/rules.md"), "the dashboard"),
      " and ",
      link(repository("SECURITY.md"), "the security policy"),
      ".",
    ),
  ],
});
