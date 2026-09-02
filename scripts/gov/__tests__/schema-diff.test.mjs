import { describe, it, expect } from 'vitest';
import { parseCsharpDto, parseTypeScriptInterface, diffContracts } from '../schema-diff.mjs';

// governance.md §2 Data Scaffold:
//   "The client data shape and the C# API response DTOs must maintain strict 1:1 parity
//    with the Azure Document Intelligence prebuilt-receipt contract fields."
//   "A CI schema verification step compares TypeScript interfaces against C# DTO contracts
//    on every pull request. Mismatches without a recorded ADR tag fail the build."

const CSHARP = `
namespace ReceiptReader.Api.Contracts;

public sealed class ReceiptDto
{
    public string? MerchantName { get; init; }
    public DateOnly? TransactionDate { get; init; }
    public decimal? Total { get; init; }
    public decimal? Tax { get; init; }
    public IReadOnlyList<ReceiptItemDto> Items { get; init; } = [];
}
`;

const TYPESCRIPT = `
export interface Receipt {
  merchantName: string | null;
  transactionDate: string | null;
  total: number | null;
  tax: number | null;
  items: ReceiptItem[];
}
`;

describe('parseCsharpDto', () => {
  it('reads every public property of the named class', () => {
    const fields = parseCsharpDto(CSHARP, 'ReceiptDto');

    expect(fields.map((f) => f.name)).toEqual([
      'MerchantName',
      'TransactionDate',
      'Total',
      'Tax',
      'Items',
    ]);
  });

  it('records nullability from the question mark', () => {
    const fields = parseCsharpDto(CSHARP, 'ReceiptDto');
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.MerchantName.nullable).toBe(true);
    expect(byName.Items.nullable).toBe(false);
  });

  it('records collection-ness, so a scalar cannot silently replace a list', () => {
    const fields = parseCsharpDto(CSHARP, 'ReceiptDto');
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.Items.collection).toBe(true);
    expect(byName.Total.collection).toBe(false);
  });

  it('ignores a class other than the one requested', () => {
    const source = `${CSHARP}\npublic sealed class Unrelated { public string? Nope { get; init; } }`;

    expect(parseCsharpDto(source, 'ReceiptDto').map((f) => f.name)).not.toContain('Nope');
  });

  it('returns nothing when the class is absent', () => {
    expect(parseCsharpDto('public class Other {}', 'ReceiptDto')).toEqual([]);
  });
});

describe('parseTypeScriptInterface', () => {
  it('reads every member of the named interface', () => {
    const fields = parseTypeScriptInterface(TYPESCRIPT, 'Receipt');

    expect(fields.map((f) => f.name)).toEqual([
      'merchantName',
      'transactionDate',
      'total',
      'tax',
      'items',
    ]);
  });

  it('treats a "| null" union as nullable', () => {
    const fields = parseTypeScriptInterface(TYPESCRIPT, 'Receipt');
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.merchantName.nullable).toBe(true);
    expect(byName.items.nullable).toBe(false);
  });

  it('treats an optional marker as nullable too', () => {
    const source = 'export interface X {\n  maybe?: string;\n}';
    expect(parseTypeScriptInterface(source, 'X')[0].nullable).toBe(true);
  });

  it('recognises an array type as a collection', () => {
    const fields = parseTypeScriptInterface(TYPESCRIPT, 'Receipt');
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.items.collection).toBe(true);
    expect(byName.total.collection).toBe(false);
  });

  it('ignores comments so a commented-out field is not counted', () => {
    const source = `
export interface X {
  real: string | null;
  // ghost: string | null;
}`;
    expect(parseTypeScriptInterface(source, 'X').map((f) => f.name)).toEqual(['real']);
  });
});

describe('diffContracts', () => {
  it('reports no differences for contracts in parity', () => {
    expect(diffContracts(parseCsharpDto(CSHARP, 'ReceiptDto'), parseTypeScriptInterface(TYPESCRIPT, 'Receipt'))).toEqual([]);
  });

  it('matches names across the casing boundary', () => {
    // C# is PascalCase on the wire only after camelCase serialization. Comparing raw names
    // would report every field as mismatched.
    const diffs = diffContracts(
      [{ name: 'MerchantName', nullable: true, collection: false }],
      [{ name: 'merchantName', nullable: true, collection: false }],
    );

    expect(diffs).toEqual([]);
  });

  it('reports a field present only in C#', () => {
    const diffs = diffContracts(parseCsharpDto(CSHARP, 'ReceiptDto'), parseTypeScriptInterface(
      TYPESCRIPT.replace('  tax: number | null;\n', ''), 'Receipt'));

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ field: 'tax', reason: 'missing-in-typescript' });
  });

  it('reports a field present only in TypeScript', () => {
    const diffs = diffContracts(
      parseCsharpDto(CSHARP, 'ReceiptDto'),
      parseTypeScriptInterface(TYPESCRIPT.replace('}', '  extra: string | null;\n}'), 'Receipt'),
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ field: 'extra', reason: 'missing-in-csharp' });
  });

  it('reports a nullability mismatch, which no field-name check would catch', () => {
    const diffs = diffContracts(
      [{ name: 'Total', nullable: true, collection: false }],
      [{ name: 'total', nullable: false, collection: false }],
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].reason).toBe('nullability-mismatch');
  });

  it('reports a collection mismatch', () => {
    const diffs = diffContracts(
      [{ name: 'Items', nullable: false, collection: true }],
      [{ name: 'items', nullable: false, collection: false }],
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].reason).toBe('collection-mismatch');
  });

  it('reports every difference, not just the first', () => {
    const diffs = diffContracts(
      [
        { name: 'A', nullable: true, collection: false },
        { name: 'B', nullable: true, collection: false },
      ],
      [{ name: 'c', nullable: true, collection: false }],
    );

    expect(diffs.map((d) => d.field).sort()).toEqual(['a', 'b', 'c']);
  });
});
