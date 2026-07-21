import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildExecpolicyRules, FORBIDDEN_GIT_SUBCOMMANDS } from '../src/execpolicy-rules.js';

const PROVENANCE_REF_RE = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

describe('buildExecpolicyRules() — forbidden decision present', () => {
  it('Given the generated rules text, when scanned, then it contains at least one prefix_rule( with decision="forbidden"', () => {
    const sut = buildExecpolicyRules();

    assert.match(sut, /prefix_rule\(\s*[\s\S]*?decision="forbidden"/);
  });
});

describe('buildExecpolicyRules() — justification coverage', () => {
  it('Given every generated rule, when its justification is read, then it is non-empty', () => {
    const sut = buildExecpolicyRules();

    const ruleCount = (sut.match(/prefix_rule\(/g) ?? []).length;
    const justifications = [...sut.matchAll(/justification="([^"]*)"/g)].map((match) => match[1]);

    assert.equal(justifications.length, ruleCount);
    assert.ok(justifications.every((justification) => justification.length > 0));
  });
});

describe('buildExecpolicyRules() — never deny all git', () => {
  it('Given the generated rules text, when scanned, then no rule uses a bare pattern=["git"]', () => {
    const sut = buildExecpolicyRules();

    assert.doesNotMatch(sut, /pattern=\[\s*"git"\s*\]/);
  });
});

describe('buildExecpolicyRules() — nested alternation for forbidden git subcommands', () => {
  it('Given the generated rules text, when scanned, then the forbidden git subcommands appear inside a nested-list alternation', () => {
    const sut = buildExecpolicyRules();

    const match = sut.match(/pattern=\[\s*"git"\s*,\s*\[([^\]]*)\]\s*\]/);

    assert.ok(match, 'expected a pattern=["git", [...]] nested alternation');
    for (const subcommand of FORBIDDEN_GIT_SUBCOMMANDS) {
      assert.ok(match[1].includes(`"${subcommand}"`));
    }
  });
});

describe('buildExecpolicyRules() — honesty disclosure', () => {
  it('Given the generated rules text, when scanned, then it discloses the interposed-global-option bypass', () => {
    const sut = buildExecpolicyRules();

    assert.match(sut, /git -c/i);
    assert.match(sut, /fail open/i);
  });
});

describe('committed craft.rules — drift guard', () => {
  it('Given the committed craft.rules file, when compared to the generator output, then the two are byte-identical', () => {
    const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'craft.rules');

    const committed = readFileSync(rulesPath, 'utf8');

    assert.equal(committed, buildExecpolicyRules());
  });
});

describe('FORBIDDEN_GIT_SUBCOMMANDS — immutability', () => {
  it('Given FORBIDDEN_GIT_SUBCOMMANDS, when a caller attempts to mutate it, then the value is unchanged', () => {
    const sut = FORBIDDEN_GIT_SUBCOMMANDS;
    const before = [...sut];

    assert.throws(() => {
      sut.push('rebase');
    }, TypeError);
    assert.deepEqual(sut, before);
  });
});

describe('buildExecpolicyRules() — no provenance refs', () => {
  it('Given the generated rules text, when scanned for provenance refs, then none is present', () => {
    const sut = buildExecpolicyRules();

    assert.doesNotMatch(sut, PROVENANCE_REF_RE);
  });
});
