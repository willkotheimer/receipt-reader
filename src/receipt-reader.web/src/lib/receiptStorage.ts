import type { StoredReceipt } from '../types/receipt';

/**
 * localStorage persistence for extracted receipts.
 *
 * governance.md §1 Client-Bound Storage Only: "Extracted receipt arrays exist only in
 * browser memory and localStorage." Nothing in this module makes a network call, and a test
 * asserts that — if it did, the architecture's central claim would be false.
 *
 * Every access is wrapped, because localStorage throws rather than returns in several real
 * situations: a full quota, private browsing, and browsers configured to block site data.
 * An upload must not crash because storage was unavailable.
 */

export const STORAGE_KEY = 'receipt-reader.receipts';

/**
 * Bumped whenever the stored shape changes. Data written under a different version is
 * discarded rather than migrated: losing a demo's history is a smaller harm than rendering
 * a table over objects whose fields are silently undefined.
 */
export const SCHEMA_VERSION = 1;

interface Envelope {
  version: number;
  receipts: StoredReceipt[];
}

export function loadReceipts(): StoredReceipt[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<Envelope> | null;

    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.receipts)) {
      return [];
    }

    return parsed.receipts;
  } catch {
    // Corrupt JSON, or storage access denied outright. Either way there is nothing to
    // show, and there is nothing the user could do about it.
    return [];
  }
}

/**
 * Persists receipts.
 *
 * @returns true when the write succeeded. Callers may surface a hint that history will not
 * survive a reload, but must not treat failure as an error worth interrupting the user for.
 */
export function saveReceipts(receipts: StoredReceipt[]): boolean {
  try {
    const envelope: Envelope = { version: SCHEMA_VERSION, receipts };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearReceipts(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the caller's intent was for the data to be gone, and it is
    // unreachable either way.
  }
}
