/** Reading the mails strapi-php's log mailer (MAIL_MAILER=log) writes to Laravel's log. */

/** Every mail to `to` in `log`, oldest first, decoded from quoted-printable as links need. */
export const mailsIn = (log: string, to: string): string[] => {
  const mails = log.split(/^\[\d{4}-\d\d-\d\d [\d:]+\] \w+\.DEBUG: /m);
  // Mail headers end their lines with CRLF.
  return mails
    .filter((mail) => mail.split(/\r?\n/).includes(`To: ${to}`))
    .map((mail) => mail.replace(/=\r?\n/g, "").replace(/=3D/gi, "="));
};

/** A query parameter of the link in `mail`, or undefined. */
export const linkParameterIn = (mail: string, name: string): string | undefined =>
  new RegExp(`[?&]${name}=([A-Za-z0-9]+)`).exec(mail)?.[1];
