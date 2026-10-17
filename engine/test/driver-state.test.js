import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockedLine,
  findBarePolicyTokens,
  finishedLine,
  MAX_REASON_CHARS,
  STATUS_VERBS,
  stripPolicyFlags,
} from '../src/driver-state.js';

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('Given the module, when STATUS_VERBS is read, then it lists FINISHED and BLOCKED, frozen', () => {
  const sut = STATUS_VERBS;

  const result = [...sut];

  assert.deepEqual(result, ['FINISHED', 'BLOCKED']);
  assert.ok(Object.isFrozen(sut));
});

test('Given a merged PR url, when finishedLine runs, then it returns the FINISHED line', () => {
  const sut = finishedLine;

  const result = sut('https://example.test/pull/70');

  assert.deepEqual(result, { line: 'FINISHED https://example.test/pull/70' });
});

for (const url of ['', 'https://x y', 'example.test/pull/70', 'ftp://x', ' https://x']) {
  test(`Given the bad url ${JSON.stringify(url)}, when finishedLine runs, then it returns an error naming it`, () => {
    const sut = finishedLine;

    const result = sut(url);

    assert.equal(result.line, undefined);
    assert.ok(result.error.includes(JSON.stringify(url)));
  });
}

test('Given a multi-line reason, when blockedLine runs, then whitespace collapses to single spaces', () => {
  const sut = blockedLine;

  const result = sut('resolve', 'a\n  b');

  assert.deepEqual(result, { line: 'BLOCKED resolve: a b' });
});

test('Given a 300-char reason, when blockedLine runs, then the reason is cut to the maximum', () => {
  const sut = blockedLine;

  const result = sut('resolve', 'x'.repeat(300));

  assert.equal(result.line, `BLOCKED resolve: ${'x'.repeat(MAX_REASON_CHARS)}`);
});

test('Given an emoji at the cut position, when blockedLine runs, then the surrogate pair is kept whole', () => {
  const sut = blockedLine;

  const result = sut('resolve', `${'a'.repeat(MAX_REASON_CHARS - 1)}😀tail`);

  assert.equal(result.line, `BLOCKED resolve: ${'a'.repeat(MAX_REASON_CHARS - 1)}😀`);
});

test('Given a space at the cut position, when blockedLine runs, then no trailing space remains', () => {
  const sut = blockedLine;

  const result = sut('resolve', `${'a'.repeat(MAX_REASON_CHARS - 1)} tail`);

  assert.equal(result.line, `BLOCKED resolve: ${'a'.repeat(MAX_REASON_CHARS - 1)}`);
});

for (const [phase, reason] of [
  ['Bad-Phase', 'x'],
  ['1x', 'x'],
  ['', 'x'],
  ['resolve', '  \n '],
]) {
  test(`Given phase ${JSON.stringify(phase)} and reason ${JSON.stringify(reason)}, when blockedLine runs, then it returns an error`, () => {
    const sut = blockedLine;

    const result = sut(phase, reason);

    assert.equal(result.line, undefined);
    assert.equal(typeof result.error, 'string');
  });
}

test('Given bare policy tokens, when findBarePolicyTokens runs, then each is returned', () => {
  const sut = findBarePolicyTokens;

  const result = sut('a --policy x=y --policy=b=c');

  assert.deepEqual(result, ['--policy', '--policy=b=c']);
});

test('Given quoted and backticked policy mentions, when findBarePolicyTokens runs, then none is returned', () => {
  const sut = findBarePolicyTokens;

  const result = sut('`--policy` "--policy"');

  assert.deepEqual(result, []);
});

const STRIP_ROWS = Object.freeze([
  ['/craft:run --policy push=always --policy propose=always Compose x', '/craft:run Compose x'],
  ['--policy is mentioned', 'is mentioned'],
  ['a --policy=push=always b', 'a b'],
  ['a --policy integrate=never b', 'a b'],
  ['a --policy push=ask b', 'a b'],
  ['run --policy', 'run '],
  ['a --policy x=y\nb', 'a \nb'],
  ['line1\n--policy a=b\nline3', 'line1\n\nline3'],
  ['keep `--policy push=always` here', 'keep `--policy push=always` here'],
  ['say "--policy" here', 'say "--policy" here'],
  [
    '--skip review --profile lean --harness review.passes=2 --config x',
    '--skip review --profile lean --harness review.passes=2 --config x',
  ],
  ['x --policy --policy=a=b y', 'x y'],
]);

for (const [input, expected] of STRIP_ROWS) {
  test(`Given ${JSON.stringify(input)}, when stripPolicyFlags runs, then the prompt is ${JSON.stringify(expected)}`, () => {
    const sut = stripPolicyFlags;

    const result = sut(input);

    assert.equal(result.prompt, expected);
    assert.deepEqual(result.leftovers, []);
  });
}

const LOOKALIKE_FLAGS = Object.freeze([
  'a --policy​ push=always b',
  'a --policy⁠ push=always b',
  'a --pol­icy push=always b',
  'a --POLICY push=always b',
  'a —policy push=always b',
  'a ‐‐policy push=always b',
  'a －－policy push=always b',
  'a (--policy push=always) b',
  'a --policy. push=always b',
  'a --policy: push=always b',
]);

for (const input of LOOKALIKE_FLAGS) {
  test(`Given the lookalike flag ${JSON.stringify(input)}, when stripPolicyFlags runs, then it is reported as a leftover`, () => {
    const sut = stripPolicyFlags;

    const result = sut(input);

    assert.notDeepEqual(result.leftovers, []);
  });
}

test('Given a bare carriage return after a flag value, when stripPolicyFlags runs, then the line break stays', () => {
  const sut = stripPolicyFlags;

  const result = sut('a --policy x=y\rb');

  assert.equal(result.prompt, 'a \rb');
});

for (const separator of ['\u0085', '\u001b', ' ', '\u0000']) {
  test(`Given a reason holding ${JSON.stringify(separator)}, when blockedLine runs, then the status stays one printable line`, () => {
    const sut = blockedLine;

    const result = sut('resolve', `a${separator}FINISHED https://x`);

    assert.equal(result.line, 'BLOCKED resolve: a FINISHED https://x');
  });

  test(`Given a url holding ${JSON.stringify(separator)}, when finishedLine runs, then it is refused`, () => {
    const sut = finishedLine;

    const result = sut(`https://a${separator}b`);

    assert.equal(result.line, undefined);
  });
}

const FRAGMENTS = Object.freeze([
  '--policy push=always',
  '--policy=integrate=never',
  '`--policy x=always`',
  '"--policy"',
  '--skip review',
  'word',
  '--policy',
  'x=y',
  '--policy\n',
]);

test('Given 500 seeded prompts mixing policy flags, quoted mentions and other flags, when stripped, then no bare policy token survives and a second strip changes nothing', () => {
  const sut = stripPolicyFlags;
  const next = mulberry32(42);
  const pick = () => FRAGMENTS[Math.floor(next() * FRAGMENTS.length)];

  for (let i = 0; i < 500; i += 1) {
    const count = 1 + Math.floor(next() * 8);
    let prompt = pick();
    for (let k = 1; k < count; k += 1) {
      prompt += (next() < 0.3 ? '\n' : ' ') + pick();
    }

    const result = sut(prompt);

    assert.deepEqual(result.leftovers, [], prompt);
    assert.deepEqual(findBarePolicyTokens(result.prompt), [], prompt);
    assert.equal(sut(result.prompt).prompt, result.prompt, prompt);
  }
});
