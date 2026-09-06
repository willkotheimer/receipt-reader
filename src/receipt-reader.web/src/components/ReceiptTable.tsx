import { Button, Table } from 'reactstrap';
import { formatCurrency, formatDate, formatQuantity } from '../lib/formatters';
import type { StoredReceipt } from '../types/receipt';

/**
 * The results box.
 *
 * Framed and full height before there is anything in it, so nothing shifts when the first
 * receipt arrives — the dashed rectangle says where rows will land rather than leaving the
 * screen blank and unexplained.
 *
 * Reads from the client-side store only (§1). Every value goes through a formatter, so a
 * null field renders as an em dash rather than as "null" or a misleading $0.00.
 */
export interface ReceiptTableProps {
  receipts: StoredReceipt[];
  onRemove: (id: string) => void;
}

export function ReceiptTable({ receipts, onRemove }: ReceiptTableProps) {
  return (
    <section className="rr-results" aria-label="Extracted receipts">
      <header className="rr-results-head">
        <span>Extracted receipts</span>
        <span className="rr-count">{receipts.length}</span>
      </header>

      <div className="rr-results-body">
        {receipts.length === 0 ? (
          <div className="rr-empty">
            <p>No receipts yet.</p>
            <p className="rr-hint">extracted rows appear here</p>
          </div>
        ) : (
          <div className="table-responsive">
            <Table hover>
              <caption className="visually-hidden">Extracted receipts</caption>
              <thead>
                <tr>
                  <th scope="col">Merchant</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="rr-num">
                    Tax
                  </th>
                  <th scope="col" className="rr-num">
                    Total
                  </th>
                  <th scope="col">Items</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="rr-merchant">
                      {receipt.merchantName ?? <span className="rr-dash">—</span>}
                    </td>
                    <td>
                      {receipt.transactionDate ? (
                        formatDate(receipt.transactionDate)
                      ) : (
                        <span className="rr-dash">—</span>
                      )}
                    </td>
                    <td className="rr-num">{formatCurrency(receipt.tax)}</td>
                    <td className="rr-num">{formatCurrency(receipt.total)}</td>
                    <td>
                      {receipt.items.length === 0 ? (
                        <span className="rr-dash">—</span>
                      ) : (
                        <ul className="list-unstyled mb-0">
                          {receipt.items.map((item, index) => (
                            <li key={`${receipt.id}-${index}`} className="rr-item">
                              {item.description ?? '—'}
                              {item.quantity !== null && item.quantity !== undefined && (
                                <> · {formatQuantity(item.quantity)} × {formatCurrency(item.price)}</>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      <Button
                        color="link"
                        className="rr-remove"
                        onClick={() => onRemove(receipt.id)}
                        aria-label={`Remove receipt from ${receipt.merchantName ?? 'unknown merchant'}`}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
