#!/usr/bin/env node
/**
 * governance.md §5 Findings Register — a finding may not be closed until a test exists that
 * would fail if the defect were reintroduced.
 *
 * Governance-Ref: §5
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const VALID_STATUSES = ['Open', 'Fixed', "Won't Fix", 'Accepted Risk'];

/** Statuses asserting the defect is handled — each must name the test that keeps it handled. */
const REQUIRES_CLOSING_TEST = ['Fixed', 'Accepted Risk'];

const FENCED_BLOCK = /^```[\s\S]*?^```/gm;
const HEADING = /^###[ \t]+(F-\d+)[ \t]*[—-][ \t]*(.*)$/gm;
const NEXT_HEADING = /^#{2,3}[ \t]/m;

const FIELDS = {
  status: 'Status',
  severity: 'Severity',
  governanceRef: 'Governance-Ref',
  found: 'Found',
  closesTest: 'Closes-Test',
  adr: 'ADR',
};

/** Straight and curly apostrophes both occur in practice; "Won't Fix" must match either. */
const normalizeApostrophes = (s) => s.replace(/[‘’]/g, "'");

const readField = (body, label) => {
  const match = body.match(new RegExp(`^[ \\t]*-[ \\t]*\\*\\*${label}:\\*\\*[ \\t]*(.*)$`, 'im'));
  return match ? match[1].trim() : '';
};

export function parseFindings(markdown) {
  // FINDINGS.md documents its own schema in a fenced block. Without this, that example is
  // read as a real finding with placeholder fields and fails the build on every run.
  const text = (markdown ?? '').replace(FENCED_BLOCK, '');
  const findings = [];

  for (const match of text.matchAll(HEADING)) {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const end = rest.search(NEXT_HEADING);
    const body = end === -1 ? rest : rest.slice(0, end);

    const finding = { id: match[1], title: match[2].trim() };
    for (const [key, label] of Object.entries(FIELDS)) {
      finding[key] = readField(body, label);
    }
    finding.status = normalizeApostrophes(finding.status);

    findings.push(finding);
  }

  return findings;
}

const isUnset = (value) => {
  const v = (value ?? '').trim().toLowerCase();
  return v === '' || v === 'n/a' || v === 'none' || v.startsWith('<');
};

export function validateFindings(markdown) {
  const violations = [];

  for (const finding of parseFindings(markdown)) {
    if (!VALID_STATUSES.includes(finding.status)) {
      violations.push({
        id: finding.id,
        reason: 'unknown-status',
        message: `status "${finding.status}" is not one of: ${VALID_STATUSES.join(', ')}`,
      });
      continue;
    }

    if (REQUIRES_CLOSING_TEST.includes(finding.status) && isUnset(finding.closesTest)) {
      violations.push({
        id: finding.id,
        reason: 'missing-closes-test',
        message: `status "${finding.status}" requires a Closes-Test signature naming the test that would fail if the defect returned`,
      });
    }

    if (finding.status === "Won't Fix" && isUnset(finding.adr)) {
      violations.push({
        id: finding.id,
        reason: 'wont-fix-without-adr',
        message: "status \"Won't Fix\" requires an ADR recording why the risk is accepted",
      });
    }
  }

  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? 'FINDINGS.md';
  const violations = validateFindings(await readFile(file, 'utf8'));

  if (violations.length > 0) {
    console.error(`\n§5 Findings Register — ${violations.length} unresolved:\n`);
    for (const v of violations) {
      console.error(`  ${v.id}: ${v.message}`);
    }
    console.error(`\nSee the schema at the top of ${file}.\n`);
    process.exit(1);
  }

  console.log('§5 Findings Register: every closed finding carries a closing test.');
}
