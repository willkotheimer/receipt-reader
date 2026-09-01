#!/usr/bin/env node
/**
 * governance.md §10 Provenance — explicit version locking.
 *
 * Fails when any dependency is declared with an open-ended range rather than an exact
 * version. Covers npm manifests (all four dependency blocks) and MSBuild PackageReference
 * in both its attribute and child-element forms.
 *
 * Governance-Ref: §10
 */

import { glob, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEPENDENCY_BLOCKS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/** Exact semver: MAJOR.MINOR.PATCH with optional prerelease and build metadata. */
const EXACT_SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isExactNpmVersion(spec) {
  if (typeof spec !== 'string') return false;
  return EXACT_SEMVER.test(spec.trim());
}

function describeNpmSpec(spec) {
  if (!spec) return 'no version specified — an exact version is required';
  if (spec.startsWith('^')) return `caret range "${spec}" — pin the exact version instead`;
  if (spec.startsWith('~')) return `tilde range "${spec}" — pin the exact version instead`;
  return `"${spec}" is not an exact version — open-ended ranges are banned`;
}

export function checkPackageJson(pkg, file) {
  const violations = [];

  for (const block of DEPENDENCY_BLOCKS) {
    const deps = pkg?.[block];
    if (!deps || typeof deps !== 'object') continue;

    for (const [name, spec] of Object.entries(deps)) {
      if (isExactNpmVersion(spec)) continue;
      violations.push({ file, block, name, spec, reason: describeNpmSpec(spec) });
    }
  }

  return violations;
}

/**
 * NuGet accepts floating versions (1.2.*), bracket ranges ([1.0,2.0)) and an omitted
 * Version attribute, which resolves to whatever the feed offers. All three defeat §10.
 */
const PACKAGE_REFERENCE = /<PackageReference\b([^>]*?)(\/>|>([\s\S]*?)<\/PackageReference>)/g;
const ATTR = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
const VERSION_ELEMENT = /<Version>\s*([^<]*?)\s*<\/Version>/i;

function isExactNuGetVersion(spec) {
  if (typeof spec !== 'string') return false;
  const trimmed = spec.trim();
  if (trimmed === '') return false;
  // Bracket/parenthesis interval notation, floating wildcards, and MSBuild properties
  // are all non-exact.
  if (/[\[\]()*$]/.test(trimmed)) return false;
  return /^\d+(\.\d+)*(-[0-9A-Za-z.-]+)?$/.test(trimmed);
}

export function checkCsproj(xml, file) {
  const violations = [];

  for (const match of xml.matchAll(PACKAGE_REFERENCE)) {
    const attributes = match[1] ?? '';
    const body = match[3] ?? '';

    const name = attributes.match(ATTR('Include'))?.[1] ?? attributes.match(ATTR('Update'))?.[1];
    if (!name) continue;

    const spec = attributes.match(ATTR('Version'))?.[1] ?? body.match(VERSION_ELEMENT)?.[1];

    if (spec === undefined) {
      violations.push({
        file,
        name,
        spec: undefined,
        reason: 'no Version attribute — the resolved version would float with the feed',
      });
      continue;
    }

    if (!isExactNuGetVersion(spec)) {
      violations.push({
        file,
        name,
        spec,
        reason: `"${spec}" is not an exact version — floating and range specs are banned`,
      });
    }
  }

  return violations;
}

const IGNORED_DIRECTORIES = ['node_modules', 'bin', 'obj', '.git'];
const isIgnored = (p) => IGNORED_DIRECTORIES.some((d) => p.split(/[\\/]/).includes(d));

async function collect(pattern) {
  const found = [];
  for await (const entry of glob(pattern)) {
    if (!isIgnored(entry)) found.push(entry);
  }
  return found.sort();
}

export async function run() {
  const violations = [];

  for (const file of await collect('**/package.json')) {
    violations.push(...checkPackageJson(JSON.parse(await readFile(file, 'utf8')), file));
  }

  for (const file of await collect('**/*.csproj')) {
    violations.push(...checkCsproj(await readFile(file, 'utf8'), file));
  }

  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = await run();

  if (violations.length > 0) {
    console.error(`\n§10 Provenance — ${violations.length} unpinned dependenc${violations.length === 1 ? 'y' : 'ies'}:\n`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`    ${v.name}: ${v.reason}`);
    }
    console.error('\nPin every dependency to an exact version. See governance.md §10.\n');
    process.exit(1);
  }

  console.log('§10 Provenance: all dependencies are exact-pinned.');
}
