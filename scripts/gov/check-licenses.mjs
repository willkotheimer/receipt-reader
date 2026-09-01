#!/usr/bin/env node
/**
 * governance.md §10 Provenance — license scanning.
 *
 * The .NET half is covered by dotnet-project-licenses, pinned in .config/dotnet-tools.json
 * and run from CI; this script covers the npm half via license-checker.
 *
 * Governance-Ref: §10
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ALLOWLIST_PATH = 'docs/allowed-licenses.json';

export function normalizeLicense(raw) {
  if (raw === undefined || raw === null) return 'UNKNOWN';
  // license-checker suffixes '*' when the license was inferred from file contents rather
  // than declared in metadata. Left in place, every guessed MIT fails the allowlist.
  const value = String(raw).trim().replace(/\*+$/, '').trim();
  return value === '' ? 'UNKNOWN' : value;
}

/** True when the parentheses wrapping the whole expression are balanced around it. */
function isFullyWrapped(expression) {
  if (!expression.startsWith('(') || !expression.endsWith(')')) return false;

  let depth = 0;
  for (let i = 0; i < expression.length; i += 1) {
    if (expression[i] === '(') depth += 1;
    else if (expression[i] === ')') {
      depth -= 1;
      if (depth === 0) return i === expression.length - 1;
    }
  }
  return false;
}

function splitTop(expression, operator) {
  const parts = [];
  let depth = 0;
  let current = '';
  const tokens = expression.split(/\s+/);

  for (const token of tokens) {
    const isOperator = depth === 0 && token.toUpperCase() === operator;
    if (isOperator) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    depth += (token.match(/\(/g) ?? []).length - (token.match(/\)/g) ?? []).length;
    current += `${token} `;
  }
  parts.push(current.trim());

  return parts.filter(Boolean);
}

export function isExpressionAllowed(expression, allowlist) {
  let expr = expression.trim();
  while (isFullyWrapped(expr)) expr = expr.slice(1, -1).trim();

  // OR lets the consumer pick, so one approved branch suffices.
  const orParts = splitTop(expr, 'OR');
  if (orParts.length > 1) return orParts.some((p) => isExpressionAllowed(p, allowlist));

  // AND imposes every component, so one unapproved component taints the package.
  const andParts = splitTop(expr, 'AND');
  if (andParts.length > 1) return andParts.every((p) => isExpressionAllowed(p, allowlist));

  return allowlist.includes(normalizeLicense(expr));
}

export function partitionByAllowance(packages, allowlist) {
  const allowed = [];
  const disallowed = [];

  for (const [name, info] of Object.entries(packages ?? {})) {
    const raw = info?.licenses;
    const expression = Array.isArray(raw)
      ? raw.map(normalizeLicense).join(' AND ')
      : normalizeLicense(raw);

    if (expression !== 'UNKNOWN' && isExpressionAllowed(expression, allowlist)) {
      allowed.push(name);
    } else {
      disallowed.push({ name, license: expression });
    }
  }

  return { allowed, disallowed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8'));
  const runtimeAllowlist = manifest.allowed;
  const fullAllowlist = [...manifest.allowed, ...(manifest.allowedBuildTime ?? [])];
  const { default: licenseChecker } = await import('license-checker');

  // excludePrivatePackages drops this repo's own manifest: §10 governs third-party
  // dependencies, and our unpublished root package is not one.
  const scan = (production) =>
    new Promise((resolve, reject) => {
      licenseChecker.init(
        { start: process.cwd(), production, excludePrivatePackages: true },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

  // Two tiers, per ADR-0002. Build-time approvals (MPL-2.0) must not reach the runtime
  // tree, so the production scan applies the strict list and fails independently.
  const tiers = [
    { label: 'production', packages: await scan(true), allowlist: runtimeAllowlist },
    { label: 'full (production + development)', packages: await scan(false), allowlist: fullAllowlist },
  ];

  let failed = false;

  for (const tier of tiers) {
    const { allowed, disallowed } = partitionByAllowance(tier.packages, tier.allowlist);

    if (disallowed.length > 0) {
      failed = true;
      console.error(`
§10 Provenance — ${disallowed.length} unapproved license(s) in the ${tier.label} tree:
`);
      for (const d of disallowed) {
        console.error(`  ${d.name}: ${d.license}`);
      }
    } else {
      console.log(`§10 Provenance: ${tier.label} tree — ${allowed.length} packages, all licenses approved.`);
    }
  }

  if (failed) {
    console.error(`
Approve it in ${ALLOWLIST_PATH}, or remove the dependency.`);
    console.error('A copyleft or source-available license needs an ADR before approval.\n');
    process.exit(1);
  }
}
