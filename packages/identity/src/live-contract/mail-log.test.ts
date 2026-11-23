import { describe, expect, it } from "vitest";
import { linkParameterIn, mailsIn } from "./mail-log.ts";

/**
 * A mail as Laravel 12's log mailer writes it: LogTransport decodes a quoted-printable body before
 * logging but keeps the `Content-Transfer-Encoding: quoted-printable` header, so the body is
 * literal whatever the header says.
 */
const logged = (to: string, link: string, at = "2026-11-22 18:02:46") =>
  [
    `[${at}] production.DEBUG: From: identgineer-cms <cms@example.test>`,
    `To: ${to}`,
    "Subject: Account confirmation",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "<p>You have to confirm your email address. Please click on the link below.</p>",
    "",
    `<p>${link}</p>`,
    "",
    "<p>Thanks.</p>  ",
  ].join("\r\n");

const LINK = "http://127.0.0.1:42981/api/auth/email-confirmation?confirmation=";

describe("the live tests' reading of the mail log", () => {
  it("finds each mail to an address, oldest first, and no other's", () => {
    const log = [
      logged("a@example.test", `${LINK}111`),
      logged("b@example.test", `${LINK}222`),
      logged("a@example.test", `${LINK}333`, "2026-11-22 18:02:47"),
    ].join("\n");
    const mails = mailsIn(log, "a@example.test");
    expect(mails.map((mail) => linkParameterIn(mail, "confirmation"))).toEqual(["111", "333"]);
    expect(mailsIn(log, "c@example.test")).toEqual([]);
  });

  it.each(["3d5c08e1a2b4", "3D5C08E1A2B4", "3de8daeb61dc"])(
    "reads a token starting with an encoded-looking 3d literally (%s)",
    (token) => {
      const mail = mailsIn(logged("a@example.test", `${LINK}${token}`), "a@example.test")[0] ?? "";
      expect(linkParameterIn(mail, "confirmation")).toBe(token);
    },
  );

  it("reads the parameter where it is, not one whose name merely ends the same", () => {
    const mail = logged("a@example.test", "http://x/reset?xcode=bad&code=good");
    expect(linkParameterIn(mail, "code")).toBe("good");
  });

  it("answers undefined when the mail has no such parameter", () => {
    expect(linkParameterIn(logged("a@example.test", "http://x/"), "code")).toBeUndefined();
  });
});
