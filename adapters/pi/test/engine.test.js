import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
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
