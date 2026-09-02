import { useMutation } from '@tanstack/react-query';
import type { Receipt } from '../types/receipt';

/**
 * Uploads a receipt for analysis.
 *
 * governance.md §1: the API returns one uninformative message for every failure, and the
 * client relays exactly that. Distinguishing causes in the UI would hand back the
 * information the API deliberately withheld — including when the server leaks something it
 * should not have.
 */

/** The only message any failure produces, matching the API's own response. */
export const GENERIC_ERROR_MESSAGE = 'Unable to process document.';

/** Mirrors the API's cap, so an oversized file fails locally instead of after an upload. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const ANALYZE_URL = '/api/receipts/analyze';

async function analyze(file: File): Promise<Receipt> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  const body = new FormData();
  body.append('file', file);

  let response: Response;
  try {
    // Content-Type is deliberately unset. Setting multipart/form-data by hand omits the
    // generated boundary, and the server cannot parse the body.
    response = await fetch(ANALYZE_URL, { method: 'POST', body });
  } catch {
    // Network failure, DNS, offline. Same message as everything else.
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  try {
    return (await response.json()) as Receipt;
  } catch {
    // A 200 with an unparseable body — a proxy error page, say. Still nothing useful to
    // tell the user.
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
}

export function useAnalyzeReceipt() {
  return useMutation<Receipt, Error, File>({
    mutationFn: analyze,
    // No retry. A rejected receipt is rejected deterministically, and retrying an upload
    // the model already refused just spends the F0 tier's page quota.
    retry: false,
  });
}
