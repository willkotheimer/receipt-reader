/**
 * The receipt contract, in strict 1:1 parity with the C# DTOs (governance.md §2).
 *
 * The schema differ added in PR7 compares this file against ReceiptDto.cs field for field,
 * so adding a property here without adding it there fails the build. Field names and
 * nullability must match the wire shape exactly, not merely be compatible with it.
 */

export interface ReceiptItem {
  description: string | null;
  quantity: number | null;
  /** Unit price. */
  price: number | null;
  /** Line total, as read by the model - not derived from quantity x price. */
  totalPrice: number | null;
}

export interface Receipt {
  merchantName: string | null;
  /** ISO-8601 calendar date, e.g. "2026-09-01". A date, not an instant. */
  transactionDate: string | null;
  total: number | null;
  tax: number | null;
  /** Never null. The API emits an empty array when no items were found. */
  items: ReceiptItem[];
}

/**
 * A receipt as held on the client.
 *
 * The two extra fields exist only in the browser and are never sent anywhere: §1 permits
 * client-bound storage only, so an id and a capture timestamp are the client's own
 * bookkeeping rather than part of the §2 contract. They are deliberately declared here
 * rather than on Receipt, so the schema differ compares the contract and not the
 * bookkeeping.
 */
export interface StoredReceipt extends Receipt {
  id: string;
  /** ISO-8601 instant at which this receipt was scanned. */
  capturedAt: string;
}
