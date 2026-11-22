/** Reading the mails strapi-php's log mailer (MAIL_MAILER=log) writes to Laravel's log. */

/**
 * Every mail to `to` in `log`, oldest first, as logged. Laravel's LogTransport decodes a
 * quoted-printable body before logging it but keeps the `Content-Transfer-Encoding` header, so the
 * body is read literally: decoding it again would turn a token starting "3d" into another.
 */
export const mailsIn = (log: string, to: string): string[] => {
  const mails = log.split(/^\[\d{4}-\d\d-\d\d [\d:]+\] \w+\.DEBUG: /m);
  // Mail headers end their lines with CRLF.
  return mails.filter((mail) => mail.split(/\r?\n/).includes(`To: ${to}`));
};

/** A query parameter of the link in `mail`, or undefined. */
export const linkParameterIn = (mail: string, name: string): string | undefined =>
  new RegExp(`[?&]${name}=([A-Za-z0-9]+)`).exec(mail)?.[1];
