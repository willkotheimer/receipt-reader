import { describe, it, expect } from 'vitest';
import { findVitestTests, findXunitTests, auditTests } from '../assertion-audit.mjs';

// governance.md §7 AI Safeguards:
//   "AI-generated tests must include meaningful assertions. Tests containing zero
//    assertions, dummy passes, or unhandled async mocks are prohibited."
//
// This gate exists because it has already been needed. The §1 zero-persistence test in PR5
// passed against an implementation that did write receipts to disk: it had assertions, but
// sampled at a point where the evidence was already gone. A detector cannot catch that
// class of fault, so this one targets what it can — tests with no assertion at all, and
// async work that is never awaited.

describe('findVitestTests', () => {
  it('finds each test and records whether it asserts', () => {
    const source = `
      describe('thing', () => {
        it('asserts', () => { expect(1).toBe(1); });
        it('does not assert', () => { const x = 1; });
      });`;

    const tests = findVitestTests(source, 'a.test.ts');

    expect(tests).toHaveLength(2);
    expect(tests.find((t) => t.name === 'asserts').hasAssertion).toBe(true);
    expect(tests.find((t) => t.name === 'does not assert').hasAssertion).toBe(false);
  });

  it('counts assert.* as an assertion, not only expect', () => {
    const source = `it('uses assert', () => { assert.strictEqual(1, 1); });`;
    expect(findVitestTests(source, 'a.test.ts')[0].hasAssertion).toBe(true);
  });

  it('counts a mock assertion', () => {
    const source = `it('checks a call', () => { expect(spy).toHaveBeenCalled(); });`;
    expect(findVitestTests(source, 'a.test.ts')[0].hasAssertion).toBe(true);
  });

  it('finds tests declared with it.each', () => {
    const source = `it.each([1,2])('case %s', (n) => { expect(n).toBeTruthy(); });`;
    expect(findVitestTests(source, 'a.test.ts')).toHaveLength(1);
  });

  it('flags an async test that never awaits, where a rejection would pass silently', () => {
    const source = `it('async', async () => { doSomethingAsync(); expect(1).toBe(1); });`;
    expect(findVitestTests(source, 'a.test.ts')[0].unawaitedAsync).toBe(true);
  });

  it('does not flag an async test that does await', () => {
    const source = `it('async', async () => { await doSomethingAsync(); expect(1).toBe(1); });`;
    expect(findVitestTests(source, 'a.test.ts')[0].unawaitedAsync).toBe(false);
  });

  it('reads the body past a destructured parameter, as Playwright specs are written', () => {
    // `async ({ page }) => {` puts a brace before the function body. A block finder that
    // takes the next brace reads `{ page }` as the body and reports every Playwright test
    // as both assertion-free and unawaited — which is exactly what happened.
    const source = `test('a spec', async ({ page }) => { await expect(page).toHaveTitle('x'); });`;
    const [found] = findVitestTests(source, 'spec.ts');

    expect(found.hasAssertion).toBe(true);
    expect(found.unawaitedAsync).toBe(false);
  });

  it('reads the body past several destructured parameters', () => {
    const source = `test('a spec', async ({ page, request }) => { const x = 1; });`;
    const [found] = findVitestTests(source, 'spec.ts');

    expect(found.hasAssertion).toBe(false);
    expect(found.unawaitedAsync).toBe(true);
  });

  it('reads the body of a plain function expression', () => {
    const source = `it('classic', function () { expect(1).toBe(1); });`;
    expect(findVitestTests(source, 'a.test.ts')[0].hasAssertion).toBe(true);
  });
});

describe('findXunitTests', () => {
  it('finds Fact and Theory methods and records assertions', () => {
    const source = `
public class Tests
{
    [Fact]
    public void Asserts() { Assert.Equal(1, 1); }

    [Theory]
    [InlineData(1)]
    public void DoesNotAssert(int n) { var x = n; }
}`;

    const tests = findXunitTests(source, 'Tests.cs');

    expect(tests.map((t) => t.name).sort()).toEqual(['Asserts', 'DoesNotAssert']);
    expect(tests.find((t) => t.name === 'Asserts').hasAssertion).toBe(true);
    expect(tests.find((t) => t.name === 'DoesNotAssert').hasAssertion).toBe(false);
  });

  it('counts a Moq Verify call as an assertion', () => {
    const source = `
public class Tests
{
    [Fact]
    public void Verifies() { mock.Verify(m => m.Thing(), Times.Once); }
}`;
    expect(findXunitTests(source, 'Tests.cs')[0].hasAssertion).toBe(true);
  });

  it('flags an async Task test with no await', () => {
    const source = `
public class Tests
{
    [Fact]
    public async Task NoAwait() { DoWork(); Assert.True(true); }
}`;
    expect(findXunitTests(source, 'Tests.cs')[0].unawaitedAsync).toBe(true);
  });

  it('ignores a non-test method', () => {
    const source = `
public class Tests
{
    private static string Helper() => "x";

    [Fact]
    public void Real() { Assert.True(true); }
}`;
    expect(findXunitTests(source, 'Tests.cs').map((t) => t.name)).toEqual(['Real']);
  });
});

describe('auditTests', () => {
  it('passes tests that assert', () => {
    expect(auditTests([{ file: 'a.test.ts', name: 'ok', hasAssertion: true, unawaitedAsync: false }])).toEqual([]);
  });

  it('fails a test with no assertion', () => {
    const violations = auditTests([
      { file: 'a.test.ts', name: 'hollow', hasAssertion: false, unawaitedAsync: false },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ name: 'hollow', reason: 'no-assertion' });
  });

  it('fails a test with unawaited async work', () => {
    const violations = auditTests([
      { file: 'a.test.ts', name: 'floating', hasAssertion: true, unawaitedAsync: true },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('unawaited-async');
  });

  it('reports both faults on one test', () => {
    const violations = auditTests([
      { file: 'a.test.ts', name: 'both', hasAssertion: false, unawaitedAsync: true },
    ]);

    expect(violations.map((v) => v.reason).sort()).toEqual(['no-assertion', 'unawaited-async']);
  });

  it('reports every offending test across files', () => {
    const violations = auditTests([
      { file: 'a.test.ts', name: 'one', hasAssertion: false, unawaitedAsync: false },
      { file: 'b.test.ts', name: 'two', hasAssertion: true, unawaitedAsync: false },
      { file: 'c.test.ts', name: 'three', hasAssertion: false, unawaitedAsync: false },
    ]);

    expect(violations.map((v) => v.name)).toEqual(['one', 'three']);
  });
});
