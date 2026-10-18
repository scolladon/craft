import { readFileSync } from 'node:fs';

const TEMPLATE = Object.freeze(JSON.parse(readFileSync(new URL('./pre-tool-use-bash.json', import.meta.url), 'utf8')));

// The live codex 0.162.1 PreToolUse Bash payload, with its command replaced.
export function preToolUseBash(command) {
  return { ...TEMPLATE, tool_input: { ...TEMPLATE.tool_input, command } };
}
