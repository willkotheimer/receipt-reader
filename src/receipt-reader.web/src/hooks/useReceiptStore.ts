import { useCallback, useState } from 'react';
import { loadReceipts, saveReceipts, clearReceipts } from '../lib/receiptStorage';
import type { Receipt, StoredReceipt } from '../types/receipt';

/**
 * The client's receipt collection.
 *
 * governance.md §1: receipts live in browser memory and localStorage and nowhere else. The
 * hook holds them in React state and mirrors that state to storage; state is the source of
 * truth for the session, so a storage failure costs durability rather than the session.
 */
export interface ReceiptStore {
  receipts: StoredReceipt[];
  /** False when the most recent write did not reach localStorage. */
  persisted: boolean;
  add: (receipt: Receipt) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const newId = (): string =>
  // randomUUID is unavailable over plain HTTP and in older browsers; the fallback only has
  // to be unique within one person's list, not globally.
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useReceiptStore(): ReceiptStore {
  // Lazy initialiser: reading storage on every render would be wasteful, and reading it in
  // an effect would flash an empty table before hydrating.
  const [receipts, setReceipts] = useState<StoredReceipt[]>(() => loadReceipts());
  const [persisted, setPersisted] = useState(true);

  const add = useCallback(
    (receipt: Receipt) => {
      const entry: StoredReceipt = {
        ...receipt,
        id: newId(),
        capturedAt: new Date().toISOString(),
      };
      // Newest first: the receipt just scanned is the one being looked at.
      setReceipts((current) => {
        const next = [entry, ...current];
        setPersisted(saveReceipts(next));
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (id: string) => {
      setReceipts((current) => {
        const next = current.filter((r) => r.id !== id);
        setPersisted(saveReceipts(next));
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    clearReceipts();
    setReceipts([]);
    setPersisted(true);
  }, []);

  return { receipts, persisted, add, remove, clear };
}
