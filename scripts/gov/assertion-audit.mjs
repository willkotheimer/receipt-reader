#!/usr/bin/env node
/**
 * governance.md §7 AI Safeguards — no zero-assertion tests, no unhandled async.
 *
 * Be clear about the limit of this gate. It detects tests that assert nothing and async
 * work that is never awaited. It does NOT detect a test that asserts the wrong thing, or
 * one that samples at a point where the evidence has already gone.
 *
 * That second failure is not hypothetical here. The §1 zero-persistence test in PR5 had
 * assertions, passed CI, and would have passed against an implementation that wrote every
 * receipt to disk — it snapshotted the temp directory after the request, by which time
 * ASP.NET had already deleted the spooled file. It was caught by deliberately running it
 * against a known-bad implementation, not by any analyzer.
 *
 * So: this gate raises the floor. The practice of checking that a new test can actually
 * fail is what catches the ceiling, and no script substitutes for it.
 *
 * Governance-Ref: §7
 */

import { glob, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const VITEST_ASSERTION = /\b(expect|assert)\s*[.(]/;
const XUNIT_ASSERTION = /\b(Assert\.|\.Verify\(|\.Should\(\))/;

/**
 * Blanks the contents of strings, template literals and comments, preserving length and
 * position so offsets still line up with the original source.
 *
 * Both false positives this gate produced on its first run came from not doing this:
 * a `}` inside a string literal truncated a test body early, and the fixture snippets
 * inside this file's own template literals were counted as real tests.
 */
function maskLiterals(source) {
  const out = source.split('');
  let i = 0;

  const blank = (from, to) => {
    for (let j = from; j < to && j < out.length; j += 1) {
      if (out[j] !== '\n') out[j] = ' ';
    }
  };

  while (i < source.length) {
    const c = source[i];

    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) break;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i += 1;
    }
  }

  return out.join('');
}

/**
 * Reads a balanced brace block starting at or after `from`, counting braces in the masked
 * source so a brace inside a string literal does not close the block.
 */
function readBlock(source, mask, from) {
  const open = mask.indexOf('{', from);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < mask.length; i += 1) {
    if (mask[i] === '{') depth += 1;
    else if (mask[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: source.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** True when the match sits inside a string or comment rather than in real code. */
function isMasked(source, mask, index, length) {
  return source.slice(index, index + length) !== mask.slice(index, index + length);
}

/**
 * An async body that starts work without awaiting it: a rejection becomes an unhandled
 * rejection rather than a failing test, so the test passes while the thing it exercises
 * is broken.
 */
function hasUnawaitedAsync(body, isAsync) {
  if (!isAsync) return false;
  return !/\bawait\b/.test(body);
}

export function findVitestTests(source, file) {
  // it(...), test(...), it.each([...])(...), and their .only/.skip variants.
  const declaration = /\b(?:it|test)(?:\.(?:each|only|skip|todo|concurrent))?\s*(?:\([^)]*\)\s*)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*(async\s*)?\(/g;
  const mask = maskLiterals(source);
  const tests = [];

  for (const match of source.matchAll(declaration)) {
    // A test declaration inside a template literal is a fixture, not a test.
    if (isMasked(source, mask, match.index, 2)) continue;

    const block = readBlock(source, mask, match.index + match[0].length);
    if (!block) continue;

    tests.push({
      file,
      name: match[2],
      hasAssertion: VITEST_ASSERTION.test(block.body),
      unawaitedAsync: hasUnawaitedAsync(block.body, Boolean(match[3])),
    });
  }

  return tests;
}

export function findXunitTests(source, file) {
  // A [Fact] or [Theory] attribute, any number of [InlineData]/[MemberData] lines, then
  // the method signature.
  const declaration = /\[(?:Fact|Theory)[^\]]*\][\s\S]*?public\s+(async\s+)?[\w<>,.\[\]?\s]+?\s+(\w+)\s*\(/g;
  const mask = maskLiterals(source);
  const tests = [];

  for (const match of source.matchAll(declaration)) {
    if (isMasked(source, mask, match.index, 2)) continue;

    const block = readBlock(source, mask, match.index + match[0].length);
    if (!block) continue;

    tests.push({
      file,
      name: match[2],
      hasAssertion: XUNIT_ASSERTION.test(block.body),
      unawaitedAsync: hasUnawaitedAsync(block.body, Boolean(match[1])),
    });
  }

  return tests;
}

export function auditTests(tests) {
  const violations = [];

  for (const test of tests) {
    if (!test.hasAssertion) {
      violations.push({
        file: test.file,
        name: test.name,
        reason: 'no-assertion',
        message: 'contains no assertion, so it passes regardless of behaviour',
      });
    }

    if (test.unawaitedAsync) {
      violations.push({
        file: test.file,
        name: test.name,
        reason: 'unawaited-async',
        message: 'is async but never awaits, so a rejection would not fail it',
      });
    }
  }

  return violations;
}

const IGNORED = ['node_modules', 'bin', 'obj', '.git', 'dist'];
const isIgnored = (p) => IGNORED.some((d) => p.split(/[\\/]/).includes(d));

async function collect(pattern) {
  const found = [];
  for await (const entry of glob(pattern)) {
    if (!isIgnored(entry)) found.push(entry);
  }
  return found.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tests = [];

  for (const file of await collect('**/*.{test,spec}.{ts,tsx,js,jsx,mjs}')) {
    tests.push(...findVitestTests(await readFile(file, 'utf8'), file));
  }

  for (const file of await collect('**/*Tests.cs')) {
    tests.push(...findXunitTests(await readFile(file, 'utf8'), file));
  }

  const violations = auditTests(tests);

  if (violations.length > 0) {
    console.error(`\n§7 AI Safeguards — ${violations.length} hollow test(s):\n`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`    ${v.name} ${v.message}`);
    }
    console.error('');
    process.exit(1);
  }

  console.log(`§7 AI Safeguards: ${tests.length} tests, all assert.`);
}
