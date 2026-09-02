import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReceiptStore } from './useReceiptStore';
import { saveReceipts, STORAGE_KEY, SCHEMA_VERSION } from '../lib/receiptStorage';
import type { Receipt, StoredReceipt } from '../types/receipt';

// governance.md §1 Client-Bound Storage Only.
// Governance-Ref: SECTION-1

const receipt = (merchant = 'Contoso Coffee'): Receipt => ({
  merchantName: merchant,
  transactionDate: '2026-09-01',
  total: 12.34,
  tax: 1.02,
  items: [],
});

const stored = (id: string, merchant = 'Old Shop'): StoredReceipt => ({
  ...receipt(merchant),
  id,
  capturedAt: '2026-08-01T00:00:00.000Z',
});

describe('useReceiptStore', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useReceiptStore());

    expect(result.current.receipts).toEqual([]);
  });

  it('hydrates from localStorage on mount', () => {
    saveReceipts([stored('r1')]);

    const { result } = renderHook(() => useReceiptStore());

    expect(result.current.receipts).toHaveLength(1);
    expect(result.current.receipts[0]?.merchantName).toBe('Old Shop');
  });

  it('adds a receipt and persists it', () => {
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.add(receipt()));

    expect(result.current.receipts).toHaveLength(1);

    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(raw.version).toBe(SCHEMA_VERSION);
    expect(raw.receipts).toHaveLength(1);
  });

  it('assigns an id and capture timestamp to a new receipt', () => {
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.add(receipt()));

    const added = result.current.receipts[0]!;
    expect(added.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(added.capturedAt))).toBe(false);
  });

  it('puts the newest receipt first', () => {
    // The table reads top-down and the receipt just scanned is the one being looked at.
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.add(receipt('First')));
    act(() => result.current.add(receipt('Second')));

    expect(result.current.receipts.map((r) => r.merchantName)).toEqual(['Second', 'First']);
  });

  it('gives each receipt a distinct id', () => {
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.add(receipt('First')));
    act(() => result.current.add(receipt('Second')));

    const [a, b] = result.current.receipts;
    expect(a!.id).not.toBe(b!.id);
  });

  it('removes a receipt by id', () => {
    saveReceipts([stored('r1', 'Keep'), stored('r2', 'Drop')]);
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.remove('r2'));

    expect(result.current.receipts.map((r) => r.merchantName)).toEqual(['Keep']);
  });

  it('clears every receipt', () => {
    saveReceipts([stored('r1'), stored('r2')]);
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.clear());

    expect(result.current.receipts).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the receipt in memory when the write fails', () => {
    // §1 says memory and localStorage. If storage is unavailable the session still works;
    // only durability is lost, and losing the upload as well would be gratuitous.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const { result } = renderHook(() => useReceiptStore());
    act(() => result.current.add(receipt()));

    expect(result.current.receipts).toHaveLength(1);
    expect(result.current.persisted).toBe(false);

    setItem.mockRestore();
  });

  it('reports persisted on a normal write', () => {
    const { result } = renderHook(() => useReceiptStore());

    act(() => result.current.add(receipt()));

    expect(result.current.persisted).toBe(true);
  });
});
