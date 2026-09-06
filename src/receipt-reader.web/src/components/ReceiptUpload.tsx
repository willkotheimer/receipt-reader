import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Button, Input, Spinner } from 'reactstrap';

/**
 * The upload group, and the one place a person sees the fail-closed message.
 *
 * governance.md §1: the API returns one uninformative string for every failure. This
 * component renders exactly that string. Adding a suggestion — "try a clearer photo" —
 * would be the UI inventing a cause it has no way to know, and would hand back precisely
 * the information the API withholds.
 */
export interface ReceiptUploadProps {
  onSelect: (file: File) => void;
  onClear: () => void;
  isPending: boolean;
  error: string | null;
  /** Enables Clear all; there is nothing to clear on a first visit. */
  hasReceipts: boolean;
}

/** Matches the content types the API accepts; anything else is refused server-side anyway. */
const ACCEPTED = 'image/jpeg,image/png,image/tiff,image/bmp,image/heif,application/pdf';

export function ReceiptUpload({
  onSelect,
  onClear,
  isPending,
  error,
  hasReceipts,
}: ReceiptUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Choosing a file no longer starts the analysis. The read is a deliberate second step, so
  // the group has a primary action and there is somewhere to show progress.
  const [chosen, setChosen] = useState<File | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setChosen(event.target.files?.[0] ?? null);
  };

  const handleRead = () => {
    if (chosen) onSelect(chosen);
  };

  const handleClear = () => {
    setChosen(null);
    // Reset the input too, so choosing the same file again still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
    onClear();
  };

  return (
    <div>
      <div className="rr-group">
        <div className="rr-group-head">Upload</div>
        <div className="rr-group-body">
          <div className="rr-file">
            <label className="visually-hidden" htmlFor={inputId}>
              Receipt image or PDF
            </label>
            <Input
              id={inputId}
              innerRef={inputRef}
              type="file"
              accept={ACCEPTED}
              disabled={isPending}
              onChange={handleChange}
            />
          </div>

          <Button
            className="btn-rr"
            onClick={handleRead}
            disabled={isPending || chosen === null}
            type="button"
          >
            Read receipt
          </Button>

          <Button
            className="btn-rr-ghost"
            onClick={handleClear}
            disabled={isPending || (!hasReceipts && chosen === null)}
            type="button"
          >
            Clear all
          </Button>
        </div>
      </div>

      {isPending && (
        <p className="rr-working mt-3">
          <Spinner className="rr-spin" aria-hidden="true" />
          <span>Analyzing receipt…</span>
        </p>
      )}

      {error && (
        <p className="rr-alert mt-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
