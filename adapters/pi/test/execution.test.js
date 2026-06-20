import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPiArgs, parseUsage } from '../src/execution.js';

const INJECTED_BLOCK = 'You are a coding agent.\n## Task\nImplement the feature.';
const DYNAMICS = { phaseId: 'implementation', slice: '5', gate: 'node --test', commitMessage: 'feat: add feature' };

describe('buildPiArgs() — prompt-only mode', () => {
  it('Given an injected block and jsonMode false, when args built, then returns array of length 2', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    assert.equal(result.length, 2);
  });

  it('Given an injected block and jsonMode false, when args built, then first element is -p flag', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    assert.equal(result[0], '-p');
  });

  it('Given an injected block and jsonMode false, when args built, then prompt is a single argv element containing the injected block verbatim', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    assert.equal(result[1].includes(INJECTED_BLOCK), true);
  });

  it('Given a prompt with shell metacharacters, when args built, then prompt is one element with no splitting', () => {
    const sut = buildPiArgs;
    const blockWithMetachars = 'Run: $(echo "dangerous") && rm -rf /';

    const result = sut(blockWithMetachars, DYNAMICS, { jsonMode: false });

    assert.equal(result.length, 2);
    assert.equal(result[1].includes(blockWithMetachars), true);
  });
});

describe('buildPiArgs() — json stream mode', () => {
  it('Given jsonMode true, when args built, then first two elements are --mode json', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: true });

    assert.equal(result[0], '--mode');
    assert.equal(result[1], 'json');
  });

  it('Given jsonMode true, when args built, then array length is 4', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: true });

    assert.equal(result.length, 4);
  });

  it('Given jsonMode true, when args built, then -p flag is at index 2 and prompt at index 3', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: true });

    assert.equal(result[2], '-p');
    assert.equal(result[3].includes(INJECTED_BLOCK), true);
  });
});

describe('buildPiArgs() — prompt contains dynamics header and formatted lines', () => {
  it('Given dynamics with phaseId and slice, when args built, then prompt contains ## Phase dynamics header verbatim', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    assert.ok(result[1].includes('## Phase dynamics'), 'prompt must contain ## Phase dynamics header');
  });

  it('Given dynamics with phaseId and slice, when args built, then prompt contains key: value formatted dynamics lines', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    assert.ok(result[1].includes('phaseId: implementation'), 'prompt must contain phaseId: implementation');
    assert.ok(result[1].includes('slice: 5'), 'prompt must contain slice: 5');
  });

  it('Given dynamics, when args built with jsonMode true, then json-mode prompt also contains ## Phase dynamics header', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: true });

    assert.ok(result[3].includes('## Phase dynamics'), 'json-mode prompt must contain ## Phase dynamics header');
  });

  it('Given dynamics, when args built, then prompt contains formatted gate: value line', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    assert.ok(result[1].includes('gate: node --test'), 'prompt must contain gate: node --test');
  });

  it('Given dynamics with multiple entries, when args built, then each key: value pair is on its own line in the prompt', () => {
    const sut = buildPiArgs;

    const result = sut(INJECTED_BLOCK, DYNAMICS, { jsonMode: false });

    const prompt = result[1];
    const dynamicsSection = prompt.split('## Phase dynamics\n')[1];
    const lines = dynamicsSection.split('\n');
    assert.ok(lines.some(l => l === 'phaseId: implementation'), 'phaseId must be on its own line');
    assert.ok(lines.some(l => l === 'slice: 5'), 'slice must be on its own line');
    assert.ok(lines.some(l => l === 'gate: node --test'), 'gate must be on its own line');
  });
});

describe('parseUsage() — JSONL stream parsing', () => {
  it('Given a JSONL stream containing a usage event, when parsed, then returns the usage object', () => {
    const sut = parseUsage;
    const usagePayload = { input_tokens: 100, output_tokens: 200, total_tokens: 300 };
    const jsonlText = [
      JSON.stringify({ type: 'message_start', message: {} }),
      JSON.stringify({ type: 'usage', usage: usagePayload }),
      JSON.stringify({ type: 'message_stop' }),
    ].join('\n');

    const result = sut(jsonlText);

    assert.deepEqual(result, usagePayload);
  });

  it('Given a JSONL stream without a usage event, when parsed, then returns null', () => {
    const sut = parseUsage;
    const jsonlText = [
      JSON.stringify({ type: 'message_start', message: {} }),
      JSON.stringify({ type: 'message_stop' }),
    ].join('\n');

    const result = sut(jsonlText);

    assert.equal(result, null);
  });

  it('Given LF-delimited input with a trailing partial line, when parsed, then splits on LF only and ignores the partial line', () => {
    const sut = parseUsage;
    const usagePayload = { input_tokens: 50, output_tokens: 75 };
    const jsonlText =
      JSON.stringify({ type: 'usage', usage: usagePayload }) + '\n' + 'partial-json{';

    const result = sut(jsonlText);

    assert.deepEqual(result, usagePayload);
  });

  it('Given CRLF line endings, when parsed on LF only, then the trailing \\r does not prevent usage extraction', () => {
    const sut = parseUsage;
    const usagePayload = { input_tokens: 10, output_tokens: 20 };
    // Splitting `line\r\n` on \n gives `["line\r", ""]`. JSON.parse accepts trailing \r.
    const jsonlText = JSON.stringify({ type: 'usage', usage: usagePayload }) + '\r\n';

    const result = sut(jsonlText);

    assert.deepEqual(result, usagePayload);
  });

  it('Given an empty string, when parsed, then returns null', () => {
    const sut = parseUsage;

    const result = sut('');

    assert.equal(result, null);
  });

  it('Given a usage-typed event with no usage payload, when parsed, then returns null', () => {
    const sut = parseUsage;
    const jsonlText = JSON.stringify({ type: 'usage' });

    const result = sut(jsonlText);

    assert.equal(result, null);
  });

  it('Given a whitespace-only line in the stream, when parsed, then that line is skipped and returns null', () => {
    const sut = parseUsage;
    const jsonlText = '   \n   \n   ';

    const result = sut(jsonlText);

    assert.equal(result, null);
  });

  it('Given a malformed JSON line in the stream, when parsed, then that line is skipped and returns null', () => {
    const sut = parseUsage;
    const jsonlText = '{ not valid json :::';

    const result = sut(jsonlText);

    assert.equal(result, null);
  });

  it('Given a stream with a whitespace-only line before the usage event, when parsed, then returns the usage payload', () => {
    const sut = parseUsage;
    const usagePayload = { input_tokens: 5, output_tokens: 10 };
    const jsonlText = '   \n' + JSON.stringify({ type: 'usage', usage: usagePayload });

    const result = sut(jsonlText);

    assert.deepEqual(result, usagePayload);
  });
});
