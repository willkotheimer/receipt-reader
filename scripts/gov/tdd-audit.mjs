#!/usr/bin/env node
/**
 * governance.md §6 TDD Execution — the branch must show a test commit at or before each
 * implementation commit.
 *
 * What this can and cannot prove: it proves tests were written separately from the code
 * they cover, which is what §6 asks for. It cannot prove the test ever failed, nor that it
 * was capable of failing. That second gap is real — see the note in assertion-audit.mjs.
 *
 * Governance-Ref: §6
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * A path is a test if it looks like one, not merely because of where it lives.
 *
 * Fixtures and helpers sit beside tests; counting them would let a commit satisfy §6 by
 * touching a sample JSON file.
 */
export function isTestFile(path) {
  const normalized = path.replace(/\\/g, '/');

  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)) return true;
  if (/Tests?\.cs$/.test(normalized)) return true;

  return false;
}

/** Source files whose change constitutes implementation work. */
function isImplementationFile(path) {
  const normalized = path.replace(/\\/g, '/');
  if (isTestFile(normalized)) return false;

  return /\.(cs|[cm]?[jt]sx?)$/.test(normalized)
    && !normalized.startsWith('scripts/gov/__tests__/');
}

export function classifyCommit(files) {
  const hasTest = files.some(isTestFile);
  const hasImplementation = files.some(isImplementationFile);

  if (hasTest && hasImplementation) return 'mixed';
  if (hasTest) return 'test';
  if (hasImplementation) return 'implementation';
  return 'neither';
}

const isMerge = (subject) => /^Merge\b/.test(subject ?? '');

/**
 * @param commits Oldest first, each { sha, subject, files }.
 */
export function auditCommits(commits) {
  const violations = [];
  let testCommitSeen = false;

  for (const commit of commits) {
    if (isMerge(commit.subject)) continue;

    const kind = classifyCommit(commit.files);

    if (kind === 'test') {
      testCommitSeen = true;
      continue;
    }

    // Infra, docs and config changes are outside §6: Bicep and Markdown have no test
    // framework in the sense the clause means, and blocking them would make the gate
    // something to be worked around rather than satisfied.
    if (kind === 'neither') continue;

    if (kind === 'implementation' && !testCommitSeen) {
      violations.push({
        sha: commit.sha,
        subject: commit.subject,
        reason: 'implementation-before-test',
        message: 'implementation commit with no preceding test commit on this branch',
      });
      continue;
    }

    if (kind === 'mixed' && !testCommitSeen) {
      violations.push({
        sha: commit.sha,
        subject: commit.subject,
        reason: 'no-separate-test-commit',
        message: 'tests and implementation land in the same commit, so nothing shows the test ever failed',
      });
    }
  }

  return violations;
}

function readCommits(range) {
  const log = execFileSync('git', ['log', '--reverse', '--format=%H%x00%s', range], {
    encoding: 'utf8',
  }).trim();

  if (!log) return [];

  return log.split('\n').map((line) => {
    const [sha, subject] = line.split('\0');
    const files = execFileSync(
      'git',
      ['show', '--name-only', '--format=', '--no-renames', sha],
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    return { sha, subject, files };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] ?? 'origin/main';
  const head = process.argv[3] ?? 'HEAD';

  const commits = readCommits(`${base}..${head}`);

  if (commits.length === 0) {
    console.log(`§6 TDD Execution: no commits in ${base}..${head}.`);
    process.exit(0);
  }

  const violations = auditCommits(commits);

  if (violations.length > 0) {
    console.error(`\n§6 TDD Execution — ${violations.length} commit(s) out of order:\n`);
    for (const v of violations) {
      console.error(`  ${v.sha.slice(0, 7)} ${v.subject}`);
      console.error(`    ${v.message}`);
    }
    console.error('\nCommit the failing test first, then the code that makes it pass.\n');
    process.exit(1);
  }

  console.log(`§6 TDD Execution: ${commits.length} commit(s) in order.`);
}
