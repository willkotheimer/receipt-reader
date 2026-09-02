# Receipt fixtures

Real receipt images for manual verification against the deployed Document Intelligence
model.

## Why these are not used by the automated suites

The unit, integration and E2E suites all substitute the analyzer rather than calling Azure:

- The **F0 tier** allows 500 pages a month and roughly two calls a minute. A suite that hit
  the real model would exhaust the quota and flake on throttling.
- A test whose result depends on a remote model's confidence score is not deterministic, and
  a non-deterministic gate teaches people to re-run rather than to read.

So the automated tests prove the *plumbing* — that bytes reach the analyzer unchanged, that
nothing is written to disk, that every failure returns one indistinguishable response. These
fixtures prove the remaining thing: that the model actually reads a real receipt.

## Manual verification

With the API running and your account holding `Cognitive Services User` on the AI resource
(see `infra/README.md`):

```bash
curl -X POST http://localhost:5199/api/receipts/analyze \
  -F "file=@tests/fixtures/receipts/primark-franklin-tn.jpg;type=image/jpeg"
```

**PowerShell:**

```powershell
curl.exe -X POST http://localhost:5199/api/receipts/analyze `
  -F "file=@tests/fixtures/receipts/primark-franklin-tn.jpg;type=image/jpeg"
```

## Files

| File | Notes |
|---|---|
| `primark-franklin-tn.jpg` | Photographed at an angle, creased, faded thermal print. Deliberately a hard case: `MerchantName` is legible, but the total appears twice and the tax line reads `$10.00 @ 0.0%`, which is the kind of thing that produces a low confidence score and exercises the §1 fail-closed path rather than the happy one. |

## Adding more

Anything committed here is published — this repository is public. Store receipts are fine;
anything carrying a name, a full card number, or an address that is not a business's is not.
