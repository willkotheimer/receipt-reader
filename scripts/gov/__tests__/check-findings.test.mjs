import { describe, it, expect } from 'vitest';
import { parseFindings, validateFindings } from '../check-findings.mjs';

// governance.md §5 Findings Register:
//   "PR merge approvals are blocked until all logged findings have corresponding closing
//    unit or integration test signatures attached."

const finding = ({
  id = 'F-0001',
  title = 'Receipt buffer reaches disk on retry',
  status = 'Fixed',
  severity = 'High',
  ref = '§1',
  found = '2026-09-01 by review',
  closesTest = 'ReceiptReader.Api.Tests.AnalyzeEndpointTests.DoesNotTouchDisk',
  adr = 'none',
} = {}) =>
  [
    `### ${id} — ${title}`,
    '',
    `- **Status:** ${status}`,
    `- **Severity:** ${severity}`,
    `- **Governance-Ref:** ${ref}`,
    `- **Found:** ${found}`,
    `- **Closes-Test:** ${closesTest}`,
    `- **ADR:** ${adr}`,
    '',
    '**Defect.** The retry path buffered the upload to a temp file.',
    '',
    '**Resolution.** Stream is now passed through untouched.',
  ].join('\n');

describe('parseFindings', () => {
  it('reads every field of a finding', () => {
    const [parsed] = parseFindings(finding());

    expect(parsed).toMatchObject({
      id: 'F-0001',
      title: 'Receipt buffer reaches disk on retry',
      status: 'Fixed',
      severity: 'High',
      closesTest: 'ReceiptReader.Api.Tests.AnalyzeEndpointTests.DoesNotTouchDisk',
      adr: 'none',
    });
  });

  it('parses several findings from one document', () => {
    const doc = [finding({ id: 'F-0001' }), finding({ id: 'F-0002' })].join('\n\n');
    expect(parseFindings(doc).map((f) => f.id)).toEqual(['F-0001', 'F-0002']);
  });

  it('ignores headings inside fenced code blocks, so the schema example is not a finding', () => {
    // FINDINGS.md documents its own schema in a fenced block. A naive parser reads that
    // example as a real finding with placeholder fields and fails the build on it.
    const doc = [
      '## Schema',
      '',
      '```',
      '### F-NNNN — <short title>',
      '',
      '- **Status:** Open | Fixed',
      '- **Closes-Test:** <signature, or `n/a` while Open>',
      '```',
      '',
      '## Open findings',
      '',
      '_None yet._',
    ].join('\n');

    expect(parseFindings(doc)).toEqual([]);
  });

  it('returns nothing for a register with no findings logged', () => {
    expect(parseFindings('# Findings Register\n\n_None yet._\n')).toEqual([]);
  });
});

describe('validateFindings', () => {
  it('accepts a Fixed finding carrying a closing test signature', () => {
    expect(validateFindings(finding({ status: 'Fixed' }))).toEqual([]);
  });

  it('accepts an Open finding with no signature yet', () => {
    expect(validateFindings(finding({ status: 'Open', closesTest: 'n/a' }))).toEqual([]);
  });

  it('blocks a Fixed finding whose signature is still n/a', () => {
    const violations = validateFindings(finding({ status: 'Fixed', closesTest: 'n/a' }));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ id: 'F-0001', reason: 'missing-closes-test' });
  });

  it('blocks a Fixed finding with an empty signature', () => {
    const violations = validateFindings(finding({ status: 'Fixed', closesTest: '' }));
    expect(violations[0].reason).toBe('missing-closes-test');
  });

  it('requires a signature for Accepted Risk, which must pin the accepted behaviour', () => {
    const violations = validateFindings(finding({ status: 'Accepted Risk', closesTest: 'n/a' }));

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('missing-closes-test');
  });

  it("lets Won't Fix carry n/a when an ADR explains why", () => {
    const violations = validateFindings(
      finding({ status: "Won't Fix", closesTest: 'n/a', adr: 'ADR-0003' })
    );
    expect(violations).toEqual([]);
  });

  it("blocks Won't Fix when no ADR justifies it", () => {
    const violations = validateFindings(
      finding({ status: "Won't Fix", closesTest: 'n/a', adr: 'none' })
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('wont-fix-without-adr');
  });

  it('rejects a status outside the permitted set', () => {
    const violations = validateFindings(finding({ status: 'Probably Fine' }));

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('unknown-status');
  });

  it('reports each offending finding independently', () => {
    const doc = [
      finding({ id: 'F-0001', status: 'Fixed', closesTest: 'n/a' }),
      finding({ id: 'F-0002', status: 'Fixed' }),
      finding({ id: 'F-0003', status: "Won't Fix", closesTest: 'n/a', adr: 'none' }),
    ].join('\n\n');

    expect(validateFindings(doc).map((v) => v.id)).toEqual(['F-0001', 'F-0003']);
  });
});
