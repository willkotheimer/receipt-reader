import { describe, it, expect } from 'vitest';
import { normalizeLicense, partitionByAllowance } from '../check-licenses.mjs';

// governance.md §10 Provenance:
//   "Mechanical license scanners (license-checker and dotnet-project-licenses) fail builds
//    on unapproved open-source licenses or unpinned versions."

const ALLOWLIST = ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'];

describe('normalizeLicense', () => {
  it('passes an already-clean identifier through unchanged', () => {
    expect(normalizeLicense('MIT')).toBe('MIT');
  });

  it('strips the asterisk license-checker appends to a guessed license', () => {
    // license-checker marks licenses inferred from file contents rather than declared
    // metadata with a trailing '*'. Left in place, every guessed MIT fails the allowlist.
    expect(normalizeLicense('MIT*')).toBe('MIT');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLicense('  Apache-2.0 ')).toBe('Apache-2.0');
  });

  it('returns UNKNOWN for an absent license rather than an empty string', () => {
    expect(normalizeLicense(undefined)).toBe('UNKNOWN');
    expect(normalizeLicense('')).toBe('UNKNOWN');
  });
});

describe('partitionByAllowance', () => {
  it('allows a package whose license is on the list', () => {
    const { allowed, disallowed } = partitionByAllowance(
      { 'react@19.0.0': { licenses: 'MIT' } },
      ALLOWLIST
    );

    expect(allowed).toEqual(['react@19.0.0']);
    expect(disallowed).toEqual([]);
  });

  it('disallows a copyleft license that is not on the list', () => {
    const { disallowed } = partitionByAllowance(
      { 'somelib@1.0.0': { licenses: 'GPL-3.0' } },
      ALLOWLIST
    );

    expect(disallowed).toEqual([{ name: 'somelib@1.0.0', license: 'GPL-3.0' }]);
  });

  it('treats an unknown license as disallowed — absence is not approval', () => {
    const { disallowed } = partitionByAllowance(
      { 'mystery@1.0.0': { licenses: undefined } },
      ALLOWLIST
    );

    expect(disallowed).toEqual([{ name: 'mystery@1.0.0', license: 'UNKNOWN' }]);
  });

  it('allows a disjunction when every alternative is approved', () => {
    const { allowed } = partitionByAllowance(
      { 'dual@1.0.0': { licenses: '(MIT OR Apache-2.0)' } },
      ALLOWLIST
    );

    expect(allowed).toEqual(['dual@1.0.0']);
  });

  it('allows a disjunction when at least one alternative is approved', () => {
    // An OR lets the consumer pick, so one approved branch is sufficient.
    const { allowed } = partitionByAllowance(
      { 'dual@1.0.0': { licenses: '(GPL-3.0 OR MIT)' } },
      ALLOWLIST
    );

    expect(allowed).toEqual(['dual@1.0.0']);
  });

  it('disallows a conjunction when any component is unapproved', () => {
    // An AND imposes both, so an unapproved component taints the whole package.
    const { disallowed } = partitionByAllowance(
      { 'both@1.0.0': { licenses: '(MIT AND GPL-3.0)' } },
      ALLOWLIST
    );

    expect(disallowed).toHaveLength(1);
    expect(disallowed[0].name).toBe('both@1.0.0');
  });

  it('accepts an array of licenses from license-checker', () => {
    const { allowed } = partitionByAllowance(
      { 'multi@1.0.0': { licenses: ['MIT', 'ISC'] } },
      ALLOWLIST
    );

    expect(allowed).toEqual(['multi@1.0.0']);
  });

  it('partitions a mixed set and preserves both sides', () => {
    const { allowed, disallowed } = partitionByAllowance(
      {
        'a@1.0.0': { licenses: 'MIT' },
        'b@1.0.0': { licenses: 'GPL-3.0' },
        'c@1.0.0': { licenses: 'Apache-2.0' },
      },
      ALLOWLIST
    );

    expect(allowed.sort()).toEqual(['a@1.0.0', 'c@1.0.0']);
    expect(disallowed.map((d) => d.name)).toEqual(['b@1.0.0']);
  });
});
