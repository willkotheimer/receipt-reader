#!/usr/bin/env node
/**
 * governance.md §3 Departure Protocol — every commit cites the clause it serves, and any
 * ADR it cites must exist on disk.
 *
 * Invoked from the husky commit-msg hook with the path to the pending message, so it fails
 * closed: a dangling ADR reference blocks the commit rather than warning about it.
 *
 * Governance-Ref: §3
 */

import { glob, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const TAG_LINE = /^Governance-Ref:[ \t]*(.*)$/im;
const CLAUSE = /§\s*(\d+)|\bSection[ \t]+(\d+)/gi;
const ADR_TOKEN = /\bADR-(\d{4})\b/g;

/** The template is a form, not a decision — citing it must never satisfy the gate. */
export const ADR_TEMPLATE = 'ADR-0000';

/** git puts instructions in the message as comment lines; they are not authored content. */
const stripComments = (message) =>
  message
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

export function parseGovernanceRefs(message) {
  const text = stripComments(message ?? '');
  const firstLine = text.trimStart().split('\n')[0] ?? '';

  const tagMatch = text.match(TAG_LINE);
  const sections = [];

  if (tagMatch) {
    for (const m of (tagMatch[1] ?? '').matchAll(CLAUSE)) {
      sections.push(`§${m[1] ?? m[2]}`);
    }
  }

  const adrs = [];
  for (const m of text.matchAll(ADR_TOKEN)) {
    const token = `ADR-${m[1]}`;
    if (!adrs.includes(token)) adrs.push(token);
  }

  return {
    hasTag: tagMatch !== null,
    sections,
    adrs,
    isMerge: /^Merge\b/.test(firstLine),
  };
}

export function validateCommitMessage(message, availableAdrs) {
  const parsed = parseGovernanceRefs(message);

  // A merge commit has no authored subject of its own to attribute to a clause.
  if (parsed.isMerge) return [];

  if (!parsed.hasTag) {
    return [
      {
        reason: 'missing-governance-ref',
        detail: 'no "Governance-Ref:" line — name the clause this change serves (§1–§10)',
      },
    ];
  }

  if (parsed.sections.length === 0) {
    return [
      {
        reason: 'malformed-governance-ref',
        detail: 'the Governance-Ref line names no clause — expected e.g. "Governance-Ref: §3"',
      },
    ];
  }

  const violations = [];

  for (const adr of parsed.adrs) {
    if (adr === ADR_TEMPLATE) {
      violations.push({
        reason: 'template-not-a-decision',
        detail: adr,
        message: `${adr} is the template, not a decision — copy it to a new numbered ADR`,
      });
      continue;
    }

    if (!availableAdrs.has(adr)) {
      violations.push({
        reason: 'unknown-adr',
        detail: adr,
        message: `${adr} is cited but docs/adr/${adr}-*.md does not exist`,
      });
    }
  }

  return violations;
}

export async function loadAvailableAdrs(directory = 'docs/adr') {
  const available = new Set();

  for await (const entry of glob(`${directory}/ADR-*.md`)) {
    const id = basename(entry).match(/^(ADR-\d{4})/)?.[1];
    if (id) available.add(id);
  }

  return available;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const messagePath = process.argv[2];

  if (!messagePath) {
    console.error('usage: check-governance-ref.mjs <path-to-commit-message>');
    process.exit(2);
  }

  const message = await readFile(messagePath, 'utf8');
  const violations = validateCommitMessage(message, await loadAvailableAdrs());

  if (violations.length > 0) {
    console.error('\n§3 Departure Protocol — commit rejected:\n');
    for (const v of violations) {
      console.error(`  ${v.message ?? v.detail}`);
    }
    console.error('\nAdd a trailing tag, e.g.:  Governance-Ref: §3');
    console.error('When departing from a clause, record an ADR under docs/adr/ and cite it.\n');
    process.exit(1);
  }
}
