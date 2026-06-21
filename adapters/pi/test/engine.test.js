import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import os from 'node:os';
import { resolvePipeline, assembleBlock } from '../src/engine.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..', '..');
const BLOCKER_MARKER = 'Blocker protocol: { unit, reason, ≤3 options }';

describe('resolvePipeline()', () => {
  it('Given the default pipeline, when resolved, then ok is true', async () => {
    const result = await resolvePipeline();

    assert.equal(result.ok, true);
  });

  it('Given the default pipeline, when resolved, then effective contains the implementation phase', async () => {
    const result = await resolvePipeline();

    const phase = result.effective.find(d => d.id === 'implementation');
    assert.ok(phase, 'implementation phase not found in effective');
  });

  it('Given the default pipeline, when resolved, then the implementation phase carries model sonnet', async () => {
    const result = await resolvePipeline();

    const phase = result.effective.find(d => d.id === 'implementation');
    assert.equal(phase.model, 'sonnet');
  });
});

describe('assembleBlock()', () => {
  it('Given the design phase id, when assembled, then returns a non-empty string', async () => {
    const result = await assembleBlock('design');

    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('Given the design phase id, when assembled, then the block contains the core blocker-protocol marker', async () => {
    const result = await assembleBlock('design');

    assert.ok(result.includes(BLOCKER_MARKER), `Expected block to contain "${BLOCKER_MARKER}"`);
  });

  it('Given the implementation phase id, when assembled, then block contains the blocker-protocol marker', async () => {
    const result = await assembleBlock('implementation');

    assert.ok(result.includes(BLOCKER_MARKER), `Expected block to contain "${BLOCKER_MARKER}"`);
  });
});

describe('assembleBlock() — return type is string', () => {
  it('Given the design phase id, when assembled, then the return value is a string (not a Buffer)', async () => {
    const result = await assembleBlock('design');

    assert.equal(typeof result, 'string');
  });
});

describe('run() — blocker on bin failure', () => {
  it('Given a non-existent descriptor-id, when assembleBlock is called, then it rejects with a blocker-shaped error containing unit: engine-bin', async () => {
    await assert.rejects(
      () => assembleBlock('__no_such_phase__'),
      (err) => {
        assert.ok(err instanceof Error, 'expected Error instance');
        assert.ok(
          err.message.includes('unit: engine-bin'),
          `blocker shape missing — got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('Given a non-existent descriptor-id, when assembleBlock is called, then the error message contains stderr detail from the bin', async () => {
    await assert.rejects(
      () => assembleBlock('__no_such_phase__'),
      (err) => {
        assert.ok(
          err.message.includes('unknown descriptor-id'),
          `error must surface stderr detail — got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('Given a non-existent descriptor-id, when assembleBlock is called, then the error message contains the bad descriptor-id in the detail', async () => {
    await assert.rejects(
      () => assembleBlock('__no_such_phase__'),
      (err) => {
        assert.ok(
          err.message.includes('__no_such_phase__'),
          `error must include the bad phase id — got: ${err.message}`,
        );
        return true;
      },
    );
  });
});

describe('repo-root resolution', () => {
  it('Given the adapter file location, when root is resolved, then engine/bin/pipeline-resolve.js exists at that path', () => {
    const resolvedBin = join(REPO_ROOT, 'engine', 'bin', 'pipeline-resolve.js');

    assert.ok(existsSync(resolvedBin), `Expected ${resolvedBin} to exist`);
  });
});

describe('resolvePipeline(manifestPath) — committed-manifest thread', () => {
  const PI_CTX_MARKER = 'PI_CTX_MARKER_UNIQUE_PROBE_VALUE';
  let tmpDir;

  after(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Given manifest skips refactoring, when resolvePipeline(manifestPath) called, then effective has 10 phases and excludes refactoring', async () => {
    tmpDir = mkdtempSync(join(os.tmpdir(), 'craft-pi-engine-test-'));
    const skipManifestPath = join(tmpDir, 'skip-manifest.md');
    writeFileSync(skipManifestPath, [
      '---',
      'gates:',
      '  phase: "node --test"',
      'pipeline:',
      '  skip: [refactoring]',
      '---',
      '# probe',
    ].join('\n'), 'utf8');

    const result = await resolvePipeline(skipManifestPath);

    assert.equal(result.effective.length, 10);
    assert.ok(
      !result.effective.some(p => p.id === 'refactoring'),
      'refactoring must not appear in effective when skipped by manifest',
    );
  });

  it('Given manifest context value, when assembleBlock(id, manifestPath) called, then assembled block contains manifest context value verbatim', async () => {
    if (!tmpDir) tmpDir = mkdtempSync(join(os.tmpdir(), 'craft-pi-engine-test-'));
    const ctxManifestPath = join(tmpDir, 'ctx-manifest.md');
    writeFileSync(ctxManifestPath, [
      '---',
      'gates:',
      '  phase: "node --test"',
      `context: ${PI_CTX_MARKER}`,
      '---',
      '# probe',
    ].join('\n'), 'utf8');

    const result = await assembleBlock('implementation', ctxManifestPath);

    assert.ok(
      result.includes(PI_CTX_MARKER),
      `Expected block to include "${PI_CTX_MARKER}" — got: ${result.slice(0, 200)}`,
    );
  });

  it('Given no manifest path, when resolvePipeline() called, then effective still has 11 phases (R-no-sc1 unchanged)', async () => {
    const result = await resolvePipeline();

    assert.equal(result.effective.length, 11);
  });

  it('Given no manifest path, when assembleBlock(design) called, then returns non-empty block (R-no-sc1 unchanged)', async () => {
    const result = await assembleBlock('design');

    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});
