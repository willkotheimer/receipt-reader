import { useId, type ChangeEvent } from 'react';
import { Alert, FormGroup, Input, Label, Spinner } from 'reactstrap';

/**
 * The upload control, and the one place a person sees the fail-closed message.
 *
 * governance.md §1: the API returns one uninformative string for every failure. This
 * component renders exactly that string. Adding a suggestion — "try a clearer photo" —
 * would be the UI inventing a cause it has no way to know, and would hand back precisely
 * the information the API withholds.
 */
export interface ReceiptUploadProps {
  onSelect: (file: File) => void;
  isPending: boolean;
  error: string | null;
}

/** Matches the content types the API accepts; anything else is refused server-side anyway. */
const ACCEPTED = 'image/jpeg,image/png,image/tiff,image/bmp,image/heif,application/pdf';

export function ReceiptUpload({ onSelect, isPending, error }: ReceiptUploadProps) {
  const inputId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onSelect(file);
    // Reset so selecting the same file twice fires a change event both times.
    event.target.value = '';
  };

  return (
    <div>
      <FormGroup>
        <Label for={inputId}>Receipt image or PDF</Label>
        <Input
          id={inputId}
          type="file"
          accept={ACCEPTED}
          disabled={isPending}
          onChange={handleChange}
        />
      </FormGroup>

      {isPending && (
        <p className="text-muted d-flex align-items-center gap-2">
          <Spinner size="sm" /> Analyzing…
        </p>
      )}

      {error && (
        <Alert color="danger" role="alert">
          {error}
        </Alert>
      )}
    </div>
  );
}
