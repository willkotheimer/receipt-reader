#!/usr/bin/env node
/**
 * governance.md §2 Data Scaffold — 1:1 parity between the C# DTO and the TypeScript
 * interface.
 *
 * Deliberately a regex parser rather than a real one. The contract is five fields in two
 * files that this project owns; pulling in a C# parser and the TypeScript compiler API to
 * read them would be more code to maintain than the thing being checked. The trade is that
 * it understands only the shapes these files actually use, which the tests pin.
 *
 * Governance-Ref: §2
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const CSHARP_DTO = 'src/ReceiptReader.Api/Contracts/ReceiptDto.cs';
const CSHARP_ITEM_DTO = 'src/ReceiptReader.Api/Contracts/ReceiptItemDto.cs';
const TYPESCRIPT_TYPES = 'src/receipt-reader.web/src/types/receipt.ts';

/** C# collection types used in the contract. A scalar replacing one is a break. */
const CSHARP_COLLECTIONS = /^(IReadOnlyList|IList|List|ICollection|IEnumerable|.*\[\])/;

/** Strips // and /* *\/ comments so a commented-out field is not counted as a field. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Extracts the body of `class <name> { ... }` or `interface <name> { ... }`. */
function extractBody(source, keyword, name) {
  const start = source.search(new RegExp(`\\b${keyword}\\s+${name}\\b`));
  if (start === -1) return null;

  const open = source.indexOf('{', start);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

export function parseCsharpDto(source, className) {
  const body = extractBody(stripComments(source), 'class', className);
  if (body === null) return [];

  const property = /public\s+([\w<>,.\[\]?]+)\s+(\w+)\s*\{\s*get;/g;
  const fields = [];

  for (const match of body.matchAll(property)) {
    const [, rawType, name] = match;
    fields.push({
      name,
      nullable: rawType.endsWith('?'),
      collection: CSHARP_COLLECTIONS.test(rawType.replace(/\?$/, '')),
    });
  }

  return fields;
}

export function parseTypeScriptInterface(source, interfaceName) {
  const body = extractBody(stripComments(source), 'interface', interfaceName);
  if (body === null) return [];

  const member = /^\s*(\w+)(\??)\s*:\s*([^;]+);/gm;
  const fields = [];

  for (const match of body.matchAll(member)) {
    const [, name, optional, rawType] = match;
    const type = rawType.trim();
    fields.push({
      name,
      // `?:` and `| null` both mean the client must handle absence.
      nullable: optional === '?' || /\|\s*(null|undefined)\b/.test(type),
      collection: /\[\]\s*$/.test(type.replace(/\s*\|\s*(null|undefined)\b/g, '').trim())
        || /^(Array|ReadonlyArray)</.test(type),
    });
  }

  return fields;
}

/**
 * Compares two field sets.
 *
 * Names are compared case-insensitively: the C# properties are PascalCase in source and
 * camelCase on the wire, so a literal comparison would report every field as a mismatch.
 */
export function diffContracts(csharpFields, typeScriptFields) {
  const key = (name) => name.toLowerCase();
  const csharp = new Map(csharpFields.map((f) => [key(f.name), f]));
  const typescript = new Map(typeScriptFields.map((f) => [key(f.name), f]));
  const differences = [];

  for (const [name, field] of csharp) {
    const other = typescript.get(name);

    if (!other) {
      differences.push({
        field: name,
        reason: 'missing-in-typescript',
        message: `${field.name} exists in the C# DTO but not in the TypeScript interface`,
      });
      continue;
    }

    if (field.nullable !== other.nullable) {
      differences.push({
        field: name,
        reason: 'nullability-mismatch',
        message: `${field.name} is ${field.nullable ? 'nullable' : 'non-nullable'} in C# but ${other.nullable ? 'nullable' : 'non-nullable'} in TypeScript`,
      });
    }

    if (field.collection !== other.collection) {
      differences.push({
        field: name,
        reason: 'collection-mismatch',
        message: `${field.name} is ${field.collection ? 'a collection' : 'a scalar'} in C# but ${other.collection ? 'a collection' : 'a scalar'} in TypeScript`,
      });
    }
  }

  for (const [name, field] of typescript) {
    if (!csharp.has(name)) {
      differences.push({
        field: name,
        reason: 'missing-in-csharp',
        message: `${field.name} exists in the TypeScript interface but not in the C# DTO`,
      });
    }
  }

  return differences;
}

const PAIRS = [
  { csharpFile: CSHARP_DTO, csharpType: 'ReceiptDto', tsType: 'Receipt' },
  { csharpFile: CSHARP_ITEM_DTO, csharpType: 'ReceiptItemDto', tsType: 'ReceiptItem' },
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const typescript = await readFile(TYPESCRIPT_TYPES, 'utf8');
  let failed = false;

  for (const pair of PAIRS) {
    const csharp = await readFile(pair.csharpFile, 'utf8');
    const differences = diffContracts(
      parseCsharpDto(csharp, pair.csharpType),
      parseTypeScriptInterface(typescript, pair.tsType),
    );

    if (differences.length > 0) {
      failed = true;
      console.error(`\n§2 Data Scaffold — ${pair.csharpType} and ${pair.tsType} are out of parity:\n`);
      for (const d of differences) console.error(`  ${d.message}`);
    } else {
      console.log(`§2 Data Scaffold: ${pair.csharpType} and ${pair.tsType} are in parity.`);
    }
  }

  if (failed) {
    console.error('\nChange both sides together, or record an ADR if the divergence is deliberate.\n');
    process.exit(1);
  }
}
