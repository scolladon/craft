// Live-pinned against opencode 1.18.3: a plugin returns its hooks at the TOP LEVEL
// (keyed by hook name), not wrapped in a `hooks` object; `tool.execute.before` receives
// (input, output) where input = { tool, sessionID, callID } and the bash command lives in
// output.args.command. The decidable logic lives in the node-tested ../src/git-guard-adapter.js.
import { decideGuard } from '../src/git-guard-adapter.js';

export const GitGuardPlugin = async () => ({
  'tool.execute.before': async (input, output) => {
    const v = decideGuard(input, output);
    if (v.block) throw new Error(v.reason);
  },
});
