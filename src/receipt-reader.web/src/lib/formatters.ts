/**
 * Display formatters (governance.md §9 - covered by Vitest).
 */

const MISSING = '—';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const date = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  // The receipt carries a calendar date, not an instant. Formatting in UTC keeps
  // "2026-01-01" as 1 Jan; without this it renders as 31 Dec anywhere west of Greenwich,
  // because the string parses as UTC midnight.
  timeZone: 'UTC',
});

/** Formats an amount. Null means the model found nothing, which is not the same as zero. */
export function formatCurrency(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : currency.format(value);
}

/** Formats an ISO-8601 calendar date, or an em dash if absent or malformed. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return MISSING;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return MISSING;

  return date.format(parsed);
}

/** Formats a quantity, keeping fractions for weighed goods. */
export function formatQuantity(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : String(value);
}
