import { test, expect, type Page } from '@playwright/test';

/**
 * governance.md §9 — end-to-end flows against the published artifact.
 *
 * Governance-Ref: SECTION-9
 */

/** A minimal JPEG header, enough to be a plausible upload. */
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const STORAGE_KEY = 'receipt-reader.receipts';

/** Serves a successful analysis without touching Azure or the F0 page quota. */
async function stubAnalyzeSuccess(page: Page, merchantName = 'Contoso Coffee') {
  await page.route('**/api/receipts/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        merchantName,
        transactionDate: '2026-09-01',
        total: 12.34,
        tax: 1.02,
        items: [{ description: 'Flat white', quantity: 2, price: 4.5, totalPrice: 9.0 }],
      }),
    });
  });
}

async function upload(page: Page, name = 'receipt.jpg') {
  await page.getByLabel(/receipt/i).setInputFiles({
    name,
    mimeType: 'image/jpeg',
    buffer: JPEG_BYTES,
  });
}

test.describe('The Receipt Reader', () => {
  test('serves the client at the root', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'The Receipt Reader' })).toBeVisible();
  });

  test('shows an empty state before anything is uploaded', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText(/no receipts yet/i)).toBeVisible();
  });

  test('happy path: an analyzed receipt appears in the table', async ({ page }) => {
    await stubAnalyzeSuccess(page);
    await page.goto('/');
    await upload(page);

    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('Contoso Coffee')).toBeVisible();
    await expect(page.getByText('$12.34')).toBeVisible();
    await expect(page.getByText('Sep 1, 2026')).toBeVisible();
  });

  test('fail-closed: a rejected document shows the generic message and nothing more', async ({ page }) => {
    // No Document Intelligence endpoint is configured on the test host, so the real API
    // fails closed. This exercises the actual server response rather than a stub.
    await page.goto('/');
    await upload(page);

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText('Unable to process document.');
  });

  test('fail-closed: no receipt is added to the table on failure', async ({ page }) => {
    await page.goto('/');
    await upload(page);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText(/no receipts yet/i)).toBeVisible();
  });

  test('receipts survive a reload, because they live in localStorage', async ({ page }) => {
    await stubAnalyzeSuccess(page, 'Corner Shop');
    await page.goto('/');
    await upload(page);
    await expect(page.getByText('Corner Shop')).toBeVisible();

    await page.reload();

    await expect(page.getByText('Corner Shop')).toBeVisible();
  });

  test('the receipt is held in localStorage under a versioned envelope', async ({ page }) => {
    await stubAnalyzeSuccess(page);
    await page.goto('/');
    await upload(page);
    await expect(page.getByText('Contoso Coffee')).toBeVisible();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);

    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(1);
    expect(parsed.receipts).toHaveLength(1);
    expect(parsed.receipts[0].merchantName).toBe('Contoso Coffee');
  });

  test('removing a receipt clears it from storage too', async ({ page }) => {
    await stubAnalyzeSuccess(page);
    await page.goto('/');
    await upload(page);
    await expect(page.getByText('Contoso Coffee')).toBeVisible();

    await page.getByRole('button', { name: /remove/i }).click();

    await expect(page.getByText(/no receipts yet/i)).toBeVisible();

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(stored!).receipts).toHaveLength(0);
  });

  test('a deep client route returns the app rather than a 404', async ({ page }) => {
    const response = await page.goto('/some/deep/route');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'The Receipt Reader' })).toBeVisible();
  });

  test('the security headers are present on the real response', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() ?? {};

    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('no receipt data is sent anywhere but the analyze endpoint', async ({ page }) => {
    // §1: extracted receipts are client-bound. A request to any other origin carrying the
    // payload would falsify that, so every request the page makes is recorded.
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await stubAnalyzeSuccess(page);
    await page.goto('/');
    await upload(page);
    await expect(page.getByText('Contoso Coffee')).toBeVisible();

    const external = requested.filter((url) => !url.startsWith('http://127.0.0.1:5199'));

    expect(external).toEqual([]);
  });
});
