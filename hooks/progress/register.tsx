import { atom, read, update } from 'claude-code'
import type { Register, StateDollar } from 'claude-code'

import { bind, failOpen, refresh } from './bind'
import type { Host } from './bind'
import type { ProgressState } from './state'

const SHAPE = 'progress-1'
const BASH_TOOL = 'Bash'
const EMPTY: ProgressState = {
  envelope: null,
  runsDir: { kind: 'unknown' },
  binding: null,
  gate: null,
  view: null,
  attention: '',
}

const progress = atom({ plugin: 'craft', key: 'progress' } as const, EMPTY, {
  shape: SHAPE,
})

type Ctx = Host & StateDollar
type MainLoopEnvelope = { transcript_path: string; cwd: string }

function cacheEnvelope($: Ctx, e: MainLoopEnvelope) {
  return update($, progress, state => ({
    ...state,
    envelope: { transcriptPath: e.transcript_path, cwd: e.cwd },
  }))
}

async function bindAndRefresh($: Ctx) {
  const state = await read($, progress)
  const next = await refresh($, await bind($, state))
  await update($, progress, () => next)
}

async function refreshBound($: Ctx) {
  const state = await read($, progress)
  if (state.binding === null) return
  const next = await refresh($, state)
  await update($, progress, () => next)
}

async function onMainLoop($: Ctx, e: MainLoopEnvelope) {
  await cacheEnvelope($, e)
  await bindAndRefresh($)
}

function onBash($: Ctx, e: MainLoopEnvelope & { agent_id?: string }) {
  return e.agent_id === undefined ? onMainLoop($, e) : refreshBound($)
}

export const register: Register = on => {
  on('classic.SessionStart', async ($, e, next) => {
    await failOpen($, 'classic.SessionStart', () => onMainLoop($, e))
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    if (e.tool_name === BASH_TOOL) {
      await failOpen($, 'classic.PostToolUse', () => onBash($, e))
    }
    return next(e)
  })
}
