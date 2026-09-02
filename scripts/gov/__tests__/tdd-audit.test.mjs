import { describe, it, expect } from 'vitest';
import { isTestFile, classifyCommit, auditCommits } from '../tdd-audit.mjs';

// governance.md §6 TDD Execution:
//   "CI workflow verifies git commit history. Every feature branch must contain a commit
//    where test files (Vitest or xUnit) were modified or added prior to or separately from
//    the passing implementation code commit."

describe('isTestFile', () => {
  it.each([
    'tests/ReceiptReader.Api.Tests/HealthEndpointTests.cs',
    'src/receipt-reader.web/src/lib/formatters.test.ts',
    'src/receipt-reader.web/src/components/ReceiptTable.test.tsx',
    'scripts/gov/__tests__/check-pins.test.mjs',
  ])('recognises %s as a test', (path) => {
    expect(isTestFile(path)).toBe(true);
  });

  it.each([
    'src/ReceiptReader.Api/Program.cs',
    'src/receipt-reader.web/src/lib/formatters.ts',
    'infra/main.bicep',
    'scripts/gov/check-pins.mjs',
  ])('does not mistake %s for a test', (path) => {
    expect(isTestFile(path)).toBe(false);
  });

  it('does not treat a file merely living under a tests directory as a test', () => {
    // Fixtures and helpers sit beside tests. Counting them would let a commit satisfy §6
    // by touching a fixture.
    expect(isTestFile('tests/ReceiptReader.Api.Tests/Fixtures/sample.json')).toBe(false);
  });
});

describe('classifyCommit', () => {
  it('classifies a commit touching only tests as a test commit', () => {
    expect(classifyCommit(['src/lib/formatters.test.ts'])).toBe('test');
  });

  it('classifies a commit touching only implementation as an implementation commit', () => {
    expect(classifyCommit(['src/lib/formatters.ts'])).toBe('implementation');
  });

  it('classifies a commit touching both as mixed', () => {
    expect(classifyCommit(['src/lib/formatters.ts', 'src/lib/formatters.test.ts'])).toBe('mixed');
  });

  it('classifies a docs-only or infra-only commit as neither', () => {
    expect(classifyCommit(['STORIES.md', 'infra/main.bicep'])).toBe('neither');
  });
});

describe('auditCommits', () => {
  const commit = (sha, subject, files) => ({ sha, subject, files });

  it('accepts a branch whose test commit precedes its implementation commit', () => {
    const violations = auditCommits([
      commit('aaa', 'S2 (red): specify the gate', ['scripts/gov/__tests__/check-pins.test.mjs']),
      commit('bbb', 'S2 (green): implement the gate', ['scripts/gov/check-pins.mjs']),
    ]);

    expect(violations).toEqual([]);
  });

  it('rejects an implementation commit with no preceding test commit', () => {
    const violations = auditCommits([
      commit('bbb', 'S2: implement the gate', ['scripts/gov/check-pins.mjs']),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ sha: 'bbb', reason: 'implementation-before-test' });
  });

  it('rejects a test commit that arrives after the implementation it covers', () => {
    const violations = auditCommits([
      commit('bbb', 'implement', ['src/lib/formatters.ts']),
      commit('aaa', 'test afterwards', ['src/lib/formatters.test.ts']),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].sha).toBe('bbb');
  });

  it('accepts a mixed commit only when a test commit already exists', () => {
    // A mixed commit is not itself proof of TDD, but it is not a violation once the branch
    // has established a red commit.
    expect(
      auditCommits([
        commit('aaa', 'red', ['src/lib/formatters.test.ts']),
        commit('bbb', 'green plus a tweak', ['src/lib/formatters.ts', 'src/lib/formatters.test.ts']),
      ]),
    ).toEqual([]);
  });

  it('rejects a branch whose only commit mixes tests and implementation', () => {
    // Writing both at once is exactly what §6 exists to prevent: nothing proves the test
    // ever failed.
    const violations = auditCommits([
      commit('aaa', 'all at once', ['src/lib/formatters.ts', 'src/lib/formatters.test.ts']),
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('no-separate-test-commit');
  });

  it('ignores commits touching neither tests nor implementation', () => {
    expect(auditCommits([commit('aaa', 'docs', ['STORIES.md'])])).toEqual([]);
  });

  it('ignores merge commits, which carry no authored change', () => {
    const violations = auditCommits([
      commit('mmm', 'Merge pull request #4 from willkotheimer/pr5', ['src/lib/formatters.ts']),
    ]);

    expect(violations).toEqual([]);
  });

  it('accepts an infra-only branch with no tests at all', () => {
    // Bicep has no test framework in §6's sense. A branch that changes only infrastructure
    // must not be blocked for failing to produce a red commit it could not write.
    expect(
      auditCommits([commit('aaa', 'infra', ['infra/main.bicep', 'infra/README.md'])]),
    ).toEqual([]);
  });

  it('reports every offending commit, not just the first', () => {
    const violations = auditCommits([
      commit('aaa', 'impl one', ['src/a.ts']),
      commit('bbb', 'impl two', ['src/b.ts']),
    ]);

    expect(violations.map((v) => v.sha)).toEqual(['aaa', 'bbb']);
  });
});
