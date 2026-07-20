const FLAG_PRINT = '-p';
const FLAG_MODE = '--mode';
const MODE_JSON = 'json';

/**
 * Build the argv array for a `pi` subprocess invocation.
 * The prompt is always a single discrete argv element — never interpolated
 * into a shell string (untrusted-input discipline: execFile, not exec).
 *
 * @param {string} injectedBlock  The assembled injected contract block.
 * @param {object} dynamics       Phase dynamics (phaseId, part, gate, commitMessage, …).
 * @param {{ jsonMode: boolean }} opts
 * @returns {string[]} argv array suitable for execFile('pi', args)
 */
export function buildPiArgs(injectedBlock, dynamics, { jsonMode }) {
  const prompt = buildPrompt(injectedBlock, dynamics);

  if (jsonMode) {
    return [FLAG_MODE, MODE_JSON, FLAG_PRINT, prompt];
  }

  return [FLAG_PRINT, prompt];
}

/**
 * Parse a JSONL event stream from `pi --mode json` and extract the assistant
 * message usage payload (the `message_end` — equivalently `turn_end` — line's
 * `message.usage`: `{input,output,cacheRead,cacheWrite,totalTokens,cost}`).
 * Splits on LF only (strict — CRLF is not treated as a line separator).
 *
 * @param {string} jsonlText Raw JSONL output from `pi --mode json`.
 * @returns {object|null} The `message.usage` payload or null if not present.
 */
export function parseUsage(jsonlText) {
  const lines = jsonlText.split('\n');

  for (const line of lines) {
    const event = tryParseJson(line);
    const usage = extractMessageUsage(event);
    if (usage !== null) {
      return usage;
    }
  }

  return null;
}

function extractMessageUsage(event) {
  if (event?.type !== 'message_end') return null;
  return event?.message?.usage ?? null;
}

function buildPrompt(injectedBlock, dynamics) {
  const dynamicsText = Object.entries(dynamics)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return `${injectedBlock}\n\n## Phase dynamics\n${dynamicsText}`;
}

function tryParseJson(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
