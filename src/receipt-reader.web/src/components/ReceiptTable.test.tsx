import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptTable } from './ReceiptTable';
import type { StoredReceipt } from '../types/receipt';

// governance.md §9 — Reactstrap results table.
// Governance-Ref: SECTION-9

const receipt = (overrides: Partial<StoredReceipt> = {}): StoredReceipt => ({
  id: 'r1',
  capturedAt: '2026-09-01T10:00:00.000Z',
  merchantName: 'Contoso Coffee',
  transactionDate: '2026-09-01',
  total: 12.34,
  tax: 1.02,
  items: [{ description: 'Flat white', quantity: 2, price: 4.5, totalPrice: 9.0 }],
  ...overrides,
});

describe('ReceiptTable', () => {
  it('renders an empty state when there are no receipts', () => {
    render(<ReceiptTable receipts={[]} onRemove={vi.fn()} />);

    expect(screen.getByText(/no receipts yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders a row per receipt', () => {
    render(
      <ReceiptTable
        receipts={[receipt({ id: 'a' }), receipt({ id: 'b', merchantName: 'Corner Shop' })]}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Contoso Coffee')).toBeInTheDocument();
    expect(screen.getByText('Corner Shop')).toBeInTheDocument();
  });

  it('formats money and dates rather than printing raw values', () => {
    render(<ReceiptTable receipts={[receipt()]} onRemove={vi.fn()} />);

    expect(screen.getByText('$12.34')).toBeInTheDocument();
    expect(screen.getByText('Sep 1, 2026')).toBeInTheDocument();
    expect(screen.queryByText('12.34')).not.toBeInTheDocument();
  });

  it('renders an em dash for fields the model could not extract', () => {
    render(
      <ReceiptTable
        receipts={[receipt({ merchantName: null, total: null, transactionDate: null })]}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the line items belonging to a receipt', () => {
    render(<ReceiptTable receipts={[receipt()]} onRemove={vi.fn()} />);

    // Substring, not exact: the line now reads "Flat white · 2 × $4.50" in one node, so the
    // description shares a text node with its quantity and price.
    expect(screen.getByText(/Flat white/)).toBeInTheDocument();
    expect(screen.getByText(/2 × \$4\.50/)).toBeInTheDocument();
  });

  it('calls onRemove with the receipt id', async () => {
    const onRemove = vi.fn();
    render(<ReceiptTable receipts={[receipt({ id: 'abc' })]} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onRemove).toHaveBeenCalledWith('abc');
  });

  it('gives the table an accessible caption', () => {
    render(<ReceiptTable receipts={[receipt()]} onRemove={vi.fn()} />);

    expect(screen.getByRole('table')).toHaveAccessibleName();
  });
});
