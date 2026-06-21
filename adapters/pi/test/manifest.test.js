import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseManifestContent } from '../../../engine/src/frontmatter.js';
import { validateManifest } from '../../../engine/src/manifest.js';
import { resolvePipeline } from '../src/engine.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dir, '..', '.claude', 'workflow.md');

describe('committed manifest — adapters/pi/.claude/workflow.md', () => {
  it('Given shipped committed manifest, when parsed, then parseManifestContent returns object with gates.phase', () => {
    const content = readFileSync(MANIFEST_PATH, 'utf8');

    const result = parseManifestContent(content);

    assert.ok(result !== null, 'parseManifestContent must return non-null object');
    assert.ok(
      typeof result.gates?.phase === 'string' && result.gates.phase.length > 0,
      `gates.phase must be a non-empty string — got: ${JSON.stringify(result?.gates)}`,
    );
  });

  it('Given shipped committed manifest, when validated, then validateManifest reports no errors', () => {
    const content = readFileSync(MANIFEST_PATH, 'utf8');
    const manifest = parseManifestContent(content);

    const result = validateManifest(manifest);

    assert.deepEqual(result, { ok: true, errors: [] });
  });

  it('Given committed manifest, when full pipeline resolved against it, then ok true and gates.phase resolvable', async () => {
    const result = await resolvePipeline(MANIFEST_PATH);

    assert.equal(result.ok, true);
    assert.ok(
      result.gateDecisions?.length > 0,
      'gateDecisions must be non-empty',
    );
    const implDecision = result.gateDecisions.find(d => d.phaseId === 'implementation');
    assert.ok(implDecision, 'implementation phase must appear in gateDecisions');
    const manifest = parseManifestContent(readFileSync(MANIFEST_PATH, 'utf8'));
    assert.ok(
      typeof manifest.gates?.phase === 'string' && manifest.gates.phase.length > 0,
      'gates.phase from manifest must be a non-empty string (DC-G floor satisfiable)',
    );
  });
});
