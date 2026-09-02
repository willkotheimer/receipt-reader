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
| `primark-franklin-tn.jpg` | As photographed: creased, faded thermal print, and lying sideways in frame. **The model scores this 0.258 against the 0.50 threshold and the app refuses it** — so this is the fixture that exercises the §1 fail-closed path against the real service. |
| `primark-franklin-tn-upright.jpg` | The same photograph rotated 90° and scaled to 1600px. Nothing else changed, and it reads: `PRIMARK`, total `$10.00`, tax `$0.00`, one item `NOTR H TEXANS SHO`. |

The pair exists because of what the first one taught. Orientation, not damage, was what
defeated the model — the paper is just as creased in both. Rotating it took the extraction
from refused to clean, which is worth knowing before concluding a receipt is unreadable.

A smaller detail, verified twice: rotating the other way (270°) reads the item as
`NDTR H TEXANS SHO`. The model is genuinely unsure of that character on this paper, and says
something different depending on which way up it looks at it.

Both are used by the portfolio capture spec in `tests/e2e/specs/capture.spec.ts`, which is
the one place in this repository that calls the real model — a walkthrough that stubbed it
would be showing something the app does not do.

## Adding more

Anything committed here is published — this repository is public. Store receipts are fine;
anything carrying a name, a full card number, or an address that is not a business's is not.
