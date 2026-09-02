import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptUpload } from './ReceiptUpload';

// governance.md §1 — the upload surface, and the one place the fail-closed message is
// shown to a person. It must say exactly what the API said and nothing more.
//
// Governance-Ref: SECTION-1

const file = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'receipt.jpg', { type: 'image/jpeg' });

describe('ReceiptUpload', () => {
  it('calls onSelect with the chosen file', async () => {
    const onSelect = vi.fn();
    render(<ReceiptUpload onSelect={onSelect} isPending={false} error={null} />);

    await userEvent.upload(screen.getByLabelText(/receipt/i), file());

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBeInstanceOf(File);
  });

  it('disables the input while a request is in flight', () => {
    render(<ReceiptUpload onSelect={vi.fn()} isPending error={null} />);

    expect(screen.getByLabelText(/receipt/i)).toBeDisabled();
  });

  it('shows a pending indicator while analyzing', () => {
    render(<ReceiptUpload onSelect={vi.fn()} isPending error={null} />);

    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it('shows the error message when one is given', () => {
    render(
      <ReceiptUpload onSelect={vi.fn()} isPending={false} error="Unable to process document." />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to process document.');
  });

  it('adds no explanation of its own to the error', () => {
    // The API withholds the reason deliberately. A helpful "try a clearer photo" here
    // would be the UI inventing a cause it does not know.
    render(
      <ReceiptUpload onSelect={vi.fn()} isPending={false} error="Unable to process document." />,
    );

    expect(screen.getByRole('alert').textContent?.trim()).toBe('Unable to process document.');
  });

  it('shows no alert when there is no error', () => {
    render(<ReceiptUpload onSelect={vi.fn()} isPending={false} error={null} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restricts the file picker to the types the API accepts', () => {
    render(<ReceiptUpload onSelect={vi.fn()} isPending={false} error={null} />);

    const accept = screen.getByLabelText(/receipt/i).getAttribute('accept') ?? '';

    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('application/pdf');
    expect(accept).not.toContain('application/zip');
  });
});
