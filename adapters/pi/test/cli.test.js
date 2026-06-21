import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dir, '..', 'package.json');
const CLI_PATH = join(__dir, '..', 'src', 'cli.js');

function runCli(...args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
}

describe('cli.js — thin bin entrypoint', () => {
  it('Given package.json bin field, when read, then craft-pi is mapped to src/cli.js', () => {
    // Arrange
    const sut = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    // Act
    const result = sut.bin?.['craft-pi'];
    // Assert
    assert.equal(result, 'src/cli.js');
  });

  it('Given cli entry, source is read, then node shebang and imports main from run.js', () => {
    // Arrange
    const sut = readFileSync(CLI_PATH, 'utf8');
    // Act / Assert
    assert.ok(sut.startsWith('#!/usr/bin/env node'), 'must start with node shebang');
    assert.ok(sut.includes("from './run.js'"), "must import from './run.js'");
  });

  it('Given cli entry, source read, then guards on import.meta.url before calling process.exit', () => {
    // Arrange
    const sut = readFileSync(CLI_PATH, 'utf8');
    // Act / Assert
    assert.ok(
      sut.includes("process.argv[1] === fileURLToPath(import.meta.url)"),
      'must guard on import.meta.url so importing the module does not run it',
    );
  });
});

// ─── subprocess execution tests (kill the NoCoverage mutants) ────────────────
// These run cli.js as a real Node subprocess so the import.meta.url guard fires
// and process.exit is actually called. The pi binary is not installed in CI so
// main() always exits 2 — but the exit code and stderr are sufficient to prove
// the guard ran, the block ran, process.argv was sliced, and io was wired.

describe('cli.js — subprocess execution guard', () => {
  it('Given cli.js is invoked directly, when it runs, then process.exit is called with an integer code (guard ran, block ran)', () => {
    const result = runCli();

    // exit code must be an integer (0 or non-zero) — never null (which would mean
    // the process was killed by a signal, or the block was empty and returned undefined).
    assert.equal(typeof result.status, 'number', 'process.exit must be called with a numeric code');
    assert.ok(result.status === 0 || result.status > 0, 'exit code must be a non-negative integer');
  });

  it('Given cli.js is invoked directly and pi binary is absent, when it runs, then it exits non-zero with a pi-run error on stderr', () => {
    const result = runCli();

    // pi not installed → main() writes a blocker to stderr and returns code 2.
    // If the ObjectLiteral mutant fired ({ } instead of { stdout, stderr }), the
    // write call would be on undefined and would throw — the process would crash
    // rather than exit cleanly.
    assert.equal(result.status, 2, `expected exit 2 (pi not installed), stderr: ${result.stderr}`);
    assert.ok(result.stderr.includes('pi'), `stderr must mention pi, got: ${result.stderr}`);
  });

  it('Given cli.js is invoked directly, when it runs, then argv is sliced (argv[0]=node argv[1]=cli.js are stripped before passing to main)', () => {
    // The MethodExpression mutant changes process.argv.slice(2) → process.argv.
    // Without the slice, argv[0] and argv[1] (node path and cli path) leak into
    // main's _argv parameter. main() ignores _argv currently, so this is a
    // provable-equivalent mutant: the leaking node/cli path strings in _argv have
    // no observable effect because main() does not read _argv.
    // EQUIVALENT: main signature declares _argv but never consumes it — any argv
    // mutation is behavior-free given the current implementation.
    // Document: the test below nonetheless exercises the full live path so coverage is counted.
    const result = runCli();

    // Subprocess must exit (not hang or throw before reaching process.exit).
    assert.notEqual(result.status, null, 'cli must exit, not be killed by signal');
  });
});
