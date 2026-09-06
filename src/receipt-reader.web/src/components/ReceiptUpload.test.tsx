import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptUpload } from './ReceiptUpload';

// governance.md §1 — the upload group, and the one place a person sees the fail-closed
// message. It must say exactly what the API said and nothing more.
//
// Governance-Ref: SECTION-1

const file = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'receipt.jpg', { type: 'image/jpeg' });

const props = (overrides: Partial<Parameters<typeof ReceiptUpload>[0]> = {}) => ({
  onSelect: vi.fn(),
  onClear: vi.fn(),
  isPending: false,
  error: null,
  hasReceipts: false,
  ...overrides,
});

describe('ReceiptUpload', () => {
  it('does not analyze on file choice alone', async () => {
    // Choosing is not reading. The second step is deliberate: it gives the group a primary
    // action and somewhere to show progress.
    const p = props();
    render(<ReceiptUpload {...p} />);

    await userEvent.upload(screen.getByLabelText(/receipt/i), file());

    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect with the chosen file when Read receipt is pressed', async () => {
    // Declared here rather than taken off the helper's return, which widens to the prop's
    // own signature and loses the mock's call record.
    const onSelect = vi.fn();
    render(<ReceiptUpload {...props({ onSelect })} />);

    await userEvent.upload(screen.getByLabelText(/receipt/i), file());
    await userEvent.click(screen.getByRole('button', { name: /read receipt/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toBeInstanceOf(File);
  });

  it('disables Read receipt until a file is chosen', async () => {
    render(<ReceiptUpload {...props()} />);

    const read = screen.getByRole('button', { name: /read receipt/i });
    expect(read).toBeDisabled();

    await userEvent.upload(screen.getByLabelText(/receipt/i), file());

    expect(read).toBeEnabled();
  });

  it('disables the input and both buttons while a request is in flight', () => {
    render(<ReceiptUpload {...props({ isPending: true, hasReceipts: true })} />);

    expect(screen.getByLabelText(/receipt/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /read receipt/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });

  it('shows a pending indicator while analyzing', () => {
    render(<ReceiptUpload {...props({ isPending: true })} />);

    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it('calls onClear when Clear all is pressed', async () => {
    const p = props({ hasReceipts: true });
    render(<ReceiptUpload {...p} />);

    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));

    expect(p.onClear).toHaveBeenCalledTimes(1);
  });

  it('disables Clear all when there is nothing to clear', () => {
    render(<ReceiptUpload {...props()} />);

    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
  });

  it('shows the error message when one is given', () => {
    render(<ReceiptUpload {...props({ error: 'Unable to process document.' })} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to process document.');
  });

  it('adds no explanation of its own to the error', () => {
    // The API withholds the reason deliberately. A helpful "try a clearer photo" here
    // would be the UI inventing a cause it does not know.
    render(<ReceiptUpload {...props({ error: 'Unable to process document.' })} />);

    expect(screen.getByRole('alert').textContent?.trim()).toBe('Unable to process document.');
  });

  it('shows no alert when there is no error', () => {
    render(<ReceiptUpload {...props()} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restricts the file picker to the types the API accepts', () => {
    render(<ReceiptUpload {...props()} />);

    const accept = screen.getByLabelText(/receipt/i).getAttribute('accept') ?? '';

    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('application/pdf');
    expect(accept).not.toContain('application/zip');
  });
});
