// Thin pi extension wrapper: pi loads this file via jiti, so no compile step
// runs and no test runner can import it directly (`node --test` cannot load
// TypeScript here). ALL decidable logic lives in the node-tested seams this
// file imports — this factory only wires them to pi's extension API.
import { resolveCraftRoot } from '../../src/craft-root.js';
import { toolCallHook } from '../../src/tool-call-hook.js';

export default function craftGuardExtension(pi) {
  process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url);

  const guard = toolCallHook();
  pi.on('tool_call', (event, ctx) => guard(event, ctx));

  pi.registerFlag('craft', { type: 'string', default: '' });
}
