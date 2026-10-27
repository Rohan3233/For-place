/**
 * A curated list of known disposable/temporary email domains — used to
 * block signup with throwaway addresses (business doc's free-tier abuse
 * concern: a fresh disposable email lets someone bypass the "1 free
 * audit per user per day" limit by just creating a new account).
 *
 * NOT exhaustive — new disposable-email services appear constantly, and
 * this list can't chase all of them. Treat this as raising the bar (kills
 * the well-known, zero-effort services), not a perfect wall. Combine with
 * Supabase email confirmation (handled separately) for a stronger gate.
 *
 * Maintenance: add to this set as new services are noticed in signup
 * logs. Matching is on the exact domain after the "@", case-insensitive.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "10minutemail.net",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmailo.com",
  "tempmail.net",
  "throwawaymail.com",
  "throwam.com",
  "yopmail.com",
  "yopmail.net",
  "yopmail.fr",
  "sharklasers.com",
  "trashmail.com",
  "trashmail.net",
  "trash-mail.com",
  "getnada.com",
  "dispostable.com",
  "fakeinbox.com",
  "fakemailgenerator.com",
  "mintemail.com",
  "mailnesia.com",
  "tempinbox.com",
  "spamgourmet.com",
  "mytemp.email",
  "moakt.com",
  "emailondeck.com",
  "mohmal.com",
  "maildrop.cc",
  "tempr.email",
  "discard.email",
  "discardmail.com",
  "spambog.com",
  "harakirimail.com",
  "mailcatch.com",
  "mail-temp.com",
  "emailfake.com",
  "crazymailing.com",
  "correotemporal.org",
  "burnermail.io",
  "inboxbear.com",
  "mailtemp.info",
  "luxusmail.org",
  "spambox.us",
  "trbvm.com",
  "mailexpire.com",
  "tempemail.co",
  "anonbox.net",
  "mailnull.com",
  "spamfree24.org",
  "meltmail.com",
  "33mail.com",
  "mailslurp.com",
  "mailsac.com",
  "one-time.email",
  "disposablemail.com",
  "nada.email",
  "tempail.com",
]);

/**
 * Returns true if the email's domain matches a known disposable-email
 * provider. Domain comparison is case-insensitive.
 */
export function isDisposableEmail(email: string): boolean {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return false;

  const domain = email.slice(atIndex + 1).trim().toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}