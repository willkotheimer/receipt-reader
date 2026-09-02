import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatQuantity } from './formatters';

// governance.md §9 — Vitest covers helper functions, custom hooks and formatters.
// Governance-Ref: SECTION-9
describe('formatCurrency', () => {
  it('formats a decimal as US currency', () => {
    expect(formatCurrency(12.34)).toBe('$12.34');
  });

  it('always shows two decimal places', () => {
    expect(formatCurrency(5)).toBe('$5.00');
    expect(formatCurrency(5.1)).toBe('$5.10');
  });

  it('renders an em dash for a field the model could not extract', () => {
    // null means "not found on this receipt", which is different from zero. Showing
    // $0.00 would assert something the model never claimed.
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });

  it('formats zero as a real amount, not as missing', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('handles a negative amount, which appears on refund receipts', () => {
    expect(formatCurrency(-4.5)).toBe('-$4.50');
  });
});

describe('formatDate', () => {
  it('formats an ISO date for display', () => {
    expect(formatDate('2026-09-01')).toBe('Sep 1, 2026');
  });

  it('renders an em dash when the date is missing', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('does not shift the date across a timezone boundary', () => {
    // new Date('2026-01-01') parses as UTC midnight; rendering it in a negative-offset
    // locale would display 31 Dec. The receipt's date is a calendar date, not an instant.
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('returns an em dash rather than "Invalid Date" for a malformed value', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('formatQuantity', () => {
  it('renders a whole quantity without decimals', () => {
    expect(formatQuantity(2)).toBe('2');
  });

  it('keeps a fractional quantity, which appears on weighed goods', () => {
    expect(formatQuantity(1.5)).toBe('1.5');
  });

  it('renders an em dash when absent', () => {
    expect(formatQuantity(null)).toBe('—');
  });
});
