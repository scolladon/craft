/**
 * Test-only preload, loaded with `node --import <this file>`. When a module whose URL ends with
 * CRAFT_SWAP_ON loads, it swaps the symlink at CRAFT_SWAP_LINK: CRAFT_SWAP_MODE `repoint` points
 * it at CRAFT_SWAP_TO, `unlink` removes it. Node has resolved and loaded the entry script by then
 * but has not evaluated it, which reproduces an install dir swapped while an entry starts.
 */

import { registerHooks } from 'node:module';
import { renameSync, symlinkSync, unlinkSync } from 'node:fs';

const { CRAFT_SWAP_LINK: link, CRAFT_SWAP_ON: trigger, CRAFT_SWAP_MODE: mode, CRAFT_SWAP_TO: target } = process.env;

// A rename over the old link is atomic, so the link is never observed missing mid-repoint.
function repoint() {
  const staged = `${link}.next`;
  symlinkSync(target, staged);
  renameSync(staged, link);
}

function unlink() {
  unlinkSync(link);
}

const SWAPS = Object.freeze({ repoint, unlink });

// Each module URL loads once, so the trigger fires at most once per process.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(trigger)) SWAPS[mode]();
    return nextLoad(url, context);
  },
});
