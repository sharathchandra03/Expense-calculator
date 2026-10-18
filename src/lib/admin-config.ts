/**
 * Operator (admin) allowlist for the in-app Support Admin Inbox.
 *
 * This client-side list controls whether the Admin Inbox UI is *shown*. Actual
 * data access is enforced server-side by Supabase (see migration
 * 20260929000200_support_admin_access.sql — the `support_operators` table +
 * SECURITY DEFINER RPCs). Keep the two in sync: an email must be in BOTH places
 * to both see the menu entry and be able to load tickets.
 *
 * >>> Replace with your own operator email(s).
 */
export const OPERATOR_EMAILS: string[] = [
  'ksharath2003@gmail.com',
]

/** Case-insensitive check that an email is an operator. */
export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  return OPERATOR_EMAILS.some(o => o.trim().toLowerCase() === e)
}
