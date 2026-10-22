import { readFileSync } from 'node:fs';

const TEMPLATE = Object.freeze(JSON.parse(readFileSync(new URL('./pre-tool-use-bash.json', import.meta.url), 'utf8')));

// The live codex PreToolUse Bash payload captured on 0.162.1 (key set re-confirmed on
// 0.163.0), with its command replaced.
export function preToolUseBash(command) {
  return { ...TEMPLATE, tool_input: { ...TEMPLATE.tool_input, command } };
}
