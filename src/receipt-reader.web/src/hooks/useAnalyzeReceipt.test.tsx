import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAnalyzeReceipt, GENERIC_ERROR_MESSAGE } from './useAnalyzeReceipt';

// governance.md §1 — the client surfaces the fail-closed error as the generic string and
// nothing more. The API deliberately withholds detail; the UI must not invent any.
//
// Governance-Ref: SECTION-1

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const file = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'receipt.jpg', {
  type: 'image/jpeg',
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('useAnalyzeReceipt', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('posts the file to the analyze endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ merchantName: 'Contoso', items: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/receipts/analyze');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('sends the file under the field name the API reads', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ merchantName: 'Contoso', items: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const body = fetchSpy.mock.calls[0]![1].body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
  });

  it('does not set Content-Type, so the boundary is generated correctly', async () => {
    // Setting multipart/form-data by hand omits the boundary and the server cannot parse
    // the body. The browser must be left to set it.
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ merchantName: 'Contoso', items: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const headers = (fetchSpy.mock.calls[0]![1].headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });

  it('returns the parsed receipt on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          merchantName: 'Contoso Coffee',
          transactionDate: '2026-09-01',
          total: 12.34,
          tax: 1.02,
          items: [{ description: 'Flat white', quantity: 1, price: 12.34, totalPrice: 12.34 }],
        }),
      ),
    );

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.merchantName).toBe('Contoso Coffee');
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('surfaces the generic message on a 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Unable to process document.' }, 400)),
    );

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('surfaces the same message on a 500, adding nothing the API did not say', async () => {
    // Even when the server does leak something, the client must not relay it.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'NullReferenceException at ReceiptEndpoints.AnalyzeAsync' }, 500),
      ),
    );

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(result.current.error?.message).not.toContain('NullReference');
  });

  it('surfaces the same message when the network fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('surfaces the same message when the response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    );

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(file());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('rejects an oversized file before making a request', async () => {
    // The API caps at 4 MB. Failing locally saves a pointless upload and gives the same
    // message the server would have.
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const huge = new File([new Uint8Array(5 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });

    const { result } = renderHook(() => useAnalyzeReceipt(), { wrapper });
    result.current.mutate(huge);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
