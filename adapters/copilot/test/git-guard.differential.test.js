import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHORS,
  CORE_SHAPES,
  PLAIN_GATE_TAGS,
  STUBS,
  generatePlainGateCommands,
  installStubs,
} from '../../../engine/test-helpers/plain-gate-generator.js';

// Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults.
const parseSeeds = text => text.split(',').map(Number);
const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
// The gate reads a -c or --config-env word as a git config key, so such a word would block for a reason other than the rule under test.
const ATTACHED_CONFIG_WORD = /^(?:--config-env|-c.)/is;
const readsAsConfigFlag = word => word === '-c' || ATTACHED_CONFIG_WORD.test(word);
const COINCIDENCE_FREE_CLASSES = Object.freeze([PLAIN_GATE_TAGS.evaluatorWord, PLAIN_GATE_TAGS.argvWrapper, PLAIN_GATE_TAGS.residual]);
const STUBBED_NAMES = Object.freeze([
  'arch', 'caffeinate', 'chrt', 'doas', 'flock', 'nice', 'nohup', 'parallel', 'setsid', 'ssh', 'stdbuf', 'strace', 'sudo', 'taskset',
  'timeout', 'tmux', 'unbuffer', 'watch', 'xcrun',
]);

const countBy = items => items.reduce((counts, item) => ({ ...counts, [item]: (counts[item] ?? 0) + 1 }), {});
const wordsOf = text => text.split(/\s+/).map(word => word.replace(/^'|'$/g, ''));

describe('plain gate generator - deterministic, coincidence-free, every class reached', () => {
  it('Given the fixed seeds, when the commands are generated twice, then both lists are identical and hold the cap', () => {
    const sut = generatePlainGateCommands;

    for (const seed of SEEDS) {
      const result = sut(seed, CAP);

      assert.deepEqual(result, sut(seed, CAP));
      assert.equal(result.length, CAP);
    }
  });

  it('Given the default seed, when the tags are counted, then every class tag is reached', () => {
    const sut = generatePlainGateCommands(SEEDS[0], CAP);

    const result = countBy(sut.flatMap(entry => entry.tags));

    for (const tag of Object.values(PLAIN_GATE_TAGS)) assert.ok((result[tag] ?? 0) > 0, `generator never reached ${tag}`);
  });

  it('Given every core shape, when generated with no prefix and no filler, then the anchor list holds it exactly once', () => {
    const sut = generatePlainGateCommands(SEEDS[0], CAP).slice(0, ANCHORS.length).map(entry => entry.text);

    for (const core of CORE_SHAPES) {
      const result = sut.filter(text => text === `${core.head}${core.render('git push')}`);

      assert.equal(result.length, 1, `${core.head}${core.render('git push')}`);
    }
  });

  it('Given the evaluator, wrapper and runner shapes, when their words are scanned, then none reads as a git config flag', () => {
    const sut = CORE_SHAPES.filter(core => core.tags.some(tag => COINCIDENCE_FREE_CLASSES.includes(tag)));

    const result = sut.flatMap(core => wordsOf(`${core.head}${core.render('git push')}`)).filter(readsAsConfigFlag);

    assert.deepEqual(result, []);
  });

  it('Given the stubs, when listed, then every external wrapper and runner the generator names is stubbed', () => {
    const sut = STUBS;

    const result = Object.keys(sut).sort();

    assert.deepEqual(result, STUBBED_NAMES);
  });

  for (const { label, argv } of [
    { label: 'an argv wrapper', argv: ['chrt', '-o', '0', 'printf', '%s', 'ran'] },
    { label: 'a string runner', argv: ['watch', '-n1', '-t', 'printf %s ran'] },
    { label: 'the ssh stub', argv: ['ssh', 'host', 'printf', '%s', 'ran'] },
  ]) {
    it(`Given ${label} stub installed in a temp bin, when run with a probe argv, then it runs the wrapped command`, () => {
      const bin = mkdtempSync(join(tmpdir(), 'craft-plain-gate-stubs-'));
      try {
        installStubs(bin);
        const sut = join(bin, argv[0]);

        const result = execFileSync(sut, argv.slice(1), { encoding: 'utf8' });

        assert.equal(result, 'ran');
      } finally {
        rmSync(bin, { recursive: true, force: true });
      }
    });
  }
});
