#!/usr/bin/env node
/**
 * Publishes the API (which builds the client into wwwroot) and runs it for Playwright.
 *
 * Publishing rather than `dotnet run` is deliberate: the tests should exercise the artifact
 * that actually ships, including the SPA fallback and static file serving, not the dev
 * server's approximation of it.
 *
 * governance.md §9
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const publishDir = join(here, '.publish');
const project = join(repoRoot, 'src/ReceiptReader.Api/ReceiptReader.Api.csproj');

const PORT = process.env.E2E_PORT ?? '5199';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    console.error(`\n${command} ${args.join(' ')} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

if (existsSync(publishDir)) {
  rmSync(publishDir, { recursive: true, force: true });
}

console.log('Publishing the API and client...');
run('dotnet', ['publish', project, '-c', 'Release', '-o', publishDir]);

const entry = join(publishDir, process.platform === 'win32' ? 'ReceiptReader.Api.exe' : 'ReceiptReader.Api');

console.log(`Starting ${entry} on port ${PORT}`);

const app = spawn(entry, [], {
  stdio: 'inherit',
  // ASP.NET takes its content root from the current working directory, not from the
  // executable's location. Without this the app runs with tests/e2e as its content root,
  // finds no wwwroot there, and serves the "no client build" fallback — which looks
  // exactly like a broken publish while the publish is in fact fine.
  cwd: publishDir,
  env: {
    ...process.env,
    ASPNETCORE_URLS: `http://127.0.0.1:${PORT}`,
    ASPNETCORE_ENVIRONMENT: 'Production',
    // No Document Intelligence endpoint is configured, so the analyzer is not registered
    // and the analyze endpoint fails closed — which is exactly the path the fail-closed
    // spec exercises. The happy path is covered by the API's own tests, where the analyzer
    // can be substituted; driving the real model from E2E would spend the F0 page quota.
    'DocumentIntelligence__Endpoint': '',
  },
});

const stop = () => {
  app.kill();
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

app.on('exit', (code) => process.exit(code ?? 0));
