import { Badge, Button, Table } from 'reactstrap';
import { formatCurrency, formatDate, formatQuantity } from '../lib/formatters';
import type { StoredReceipt } from '../types/receipt';

/**
 * The results table.
 *
 * Reads from the client-side store only (§1). Every value goes through a formatter, so a
 * null field renders as an em dash rather than as "null" or as a misleading $0.00.
 */
export interface ReceiptTableProps {
  receipts: StoredReceipt[];
  onRemove: (id: string) => void;
}

export function ReceiptTable({ receipts, onRemove }: ReceiptTableProps) {
  if (receipts.length === 0) {
    return <p className="text-muted">No receipts yet. Upload one to get started.</p>;
  }

  return (
    <Table responsive hover>
      <caption className="visually-hidden">Extracted receipts</caption>
      <thead>
        <tr>
          <th scope="col">Merchant</th>
          <th scope="col">Date</th>
          <th scope="col" className="text-end">Tax</th>
          <th scope="col" className="text-end">Total</th>
          <th scope="col">Items</th>
          <th scope="col"><span className="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {receipts.map((receipt) => (
          <tr key={receipt.id}>
            <td>{receipt.merchantName ?? '—'}</td>
            <td>{formatDate(receipt.transactionDate)}</td>
            <td className="text-end font-monospace">{formatCurrency(receipt.tax)}</td>
            <td className="text-end font-monospace">{formatCurrency(receipt.total)}</td>
            <td>
              {receipt.items.length === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                <ul className="list-unstyled mb-0 small">
                  {receipt.items.map((item, index) => (
                    <li key={`${receipt.id}-${index}`}>
                      {item.description ?? '—'}{' '}
                      <Badge color="light" pill className="text-dark">
                        {formatQuantity(item.quantity)} × {formatCurrency(item.price)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </td>
            <td>
              <Button
                size="sm"
                color="link"
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
  );
}
