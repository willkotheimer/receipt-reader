import { defineConfig } from 'vitest/config';

// Root Vitest project: the governance tooling only (§3, §5, §10).
// The React client ships its own config under src/receipt-reader.web in PR6, so the
// include pattern is scoped deliberately rather than left at the default glob.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/gov/__tests__/**/*.test.mjs'],
    reporters: ['default'],
  },
});
