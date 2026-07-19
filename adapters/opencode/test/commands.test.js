import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const COMMANDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'commands');

const PHASES = ['run', 'review', 'validation', 'init'];

const CRAFT_ROOT_SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
const BARE_PLUGIN_ROOT = /\$\{CLAUDE_PLUGIN_ROOT\}/;
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

/** Split a `---\n…\n---` frontmatter block into top-level attrs + body. No yaml dep. */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    throw new Error('missing opening frontmatter fence');
  }
  const closeIndex = lines.indexOf('---', 1);
  if (closeIndex === -1) {
    throw new Error('missing closing frontmatter fence');
  }

  const attrs = {};
  for (const line of lines.slice(1, closeIndex)) {
    const match = /^([a-zA-Z_]+):\s?(.*)$/.exec(line);
    if (match) {
      attrs[match[1]] = match[2].trim();
    }
  }

  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { attrs, body };
}

function readCommandDef(phase) {
  const filePath = path.join(COMMANDS_DIR, `craft-${phase}.md`);
  const content = readFileSync(filePath, 'utf8');
  return parseFrontmatter(content);
}

describe('craft-<phase>.md — file existence', () => {
  for (const phase of PHASES) {
    it(`Given phase "${phase}", when reading commands/craft-${phase}.md, then the file exists`, () => {
      const sut = readCommandDef;

      const result = () => sut(phase);

      assert.doesNotThrow(result);
    });
  }
});

describe('craft-<phase>.md — frontmatter contract', () => {
  for (const phase of PHASES) {
    it(`Given craft-${phase}.md, when frontmatter is parsed, then description is non-empty`, () => {
      const sut = readCommandDef(phase);

      const result = sut.attrs.description;

      assert.ok(result && result.length > 0);
    });
  }
});

describe('craft-run.md — primary-mode invariant', () => {
  it('Given craft-run.md, when frontmatter is parsed, then subtask is not set to "true"', () => {
    const sut = readCommandDef('run');

    const result = sut.attrs.subtask;

    assert.notEqual(result, 'true');
  });
});

describe('craft-<phase>.md — body templating contract', () => {
  for (const phase of PHASES) {
    it(`Given craft-${phase}.md, when the body is scanned, then it carries the $ARGUMENTS token`, () => {
      const sut = readCommandDef(phase);

      const result = sut.body;

      assert.ok(result.includes('$ARGUMENTS'));
    });

    it(`Given craft-${phase}.md, when the body is scanned, then its dispatch references the CRAFT_ROOT shim`, () => {
      const sut = readCommandDef(phase);

      const result = sut.body;

      assert.ok(result.includes(CRAFT_ROOT_SHIM));
    });

    it(`Given craft-${phase}.md, when the body is scanned, then no bare \${CLAUDE_PLUGIN_ROOT} invocation remains outside the shim`, () => {
      const sut = readCommandDef(phase);

      const withoutShims = sut.body.split(CRAFT_ROOT_SHIM).join('');

      assert.doesNotMatch(withoutShims, BARE_PLUGIN_ROOT);
    });
  }
});

describe('craft-<phase>.md — body provenance hygiene', () => {
  for (const phase of PHASES) {
    it(`Given craft-${phase}.md, when the body is scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = readCommandDef(phase);

      const result = sut.body;

      assert.doesNotMatch(result, PROVENANCE_REF);
    });
  }
});
