import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  STORAGE_KEY,
  SCHEMA_VERSION,
  loadReceipts,
  saveReceipts,
  clearReceipts,
} from './receiptStorage';
import type { StoredReceipt } from '../types/receipt';

// governance.md §1 Client-Bound Storage Only:
//   "Extracted receipt arrays exist only in browser memory and localStorage."
//
// Governance-Ref: SECTION-1

const receipt = (overrides: Partial<StoredReceipt> = {}): StoredReceipt => ({
  id: 'r1',
  capturedAt: '2026-09-01T10:00:00.000Z',
  merchantName: 'Contoso Coffee',
  transactionDate: '2026-09-01',
  total: 12.34,
  tax: 1.02,
  items: [{ description: 'Flat white', quantity: 1, price: 12.34, totalPrice: 12.34 }],
  ...overrides,
});

describe('receiptStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('round-trips receipts through localStorage', () => {
    saveReceipts([receipt()]);

    const loaded = loadReceipts();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.merchantName).toBe('Contoso Coffee');
    expect(loaded[0]?.total).toBe(12.34);
  });

  it('returns an empty array when nothing has been stored', () => {
    expect(loadReceipts()).toEqual([]);
  });

  it('writes under a versioned envelope', () => {
    // The version is what lets a future shape change be detected rather than misread.
    saveReceipts([receipt()]);

    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');

    expect(raw.version).toBe(SCHEMA_VERSION);
    expect(Array.isArray(raw.receipts)).toBe(true);
  });

  it('discards data written under a different schema version', () => {
    // Returning stale data shaped for an older version would surface undefined fields
    // deep in the table. Dropping it loses a demo's history, which is the lesser harm.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION - 1, receipts: [receipt()] }),
    );

    expect(loadReceipts()).toEqual([]);
  });

  it('discards a corrupt payload rather than throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');

    expect(loadReceipts()).toEqual([]);
  });

  it('discards a payload whose receipts field is not an array', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, receipts: 'nope' }),
    );

    expect(loadReceipts()).toEqual([]);
  });

  it('survives a quota-exceeded write without throwing', () => {
    // Private browsing and full storage both throw on setItem. A demo losing history is
    // acceptable; a crash on upload is not.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    expect(() => saveReceipts([receipt()])).not.toThrow();

    setItem.mockRestore();
  });

  it('reports failure when a quota-exceeded write is swallowed', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    expect(saveReceipts([receipt()])).toBe(false);

    setItem.mockRestore();
  });

  it('reports success on a normal write', () => {
    expect(saveReceipts([receipt()])).toBe(true);
  });

  it('survives localStorage being unavailable entirely', () => {
    // Some browsers throw on any access when cookies are blocked.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError');
    });

    expect(loadReceipts()).toEqual([]);

    getItem.mockRestore();
  });

  it('clears stored receipts', () => {
    saveReceipts([receipt()]);
    clearReceipts();

    expect(loadReceipts()).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('never issues a network request', () => {
    // §1 permits client-bound storage only. If this module ever posted receipts anywhere,
    // the architecture's central claim would be false.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    saveReceipts([receipt()]);
    loadReceipts();
    clearReceipts();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
