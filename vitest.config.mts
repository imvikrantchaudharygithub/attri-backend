import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./tests/setup.ts'],
        // argon2 is deliberately slow (19 MiB, 2 iterations) — a suite that
        // hashes a dozen passwords needs headroom.
        testTimeout: 20000,
        hookTimeout: 30000,
        // Tests share one database and wipe collections between cases, so they
        // must not run in parallel across files.
        fileParallelism: false,
    },
});
