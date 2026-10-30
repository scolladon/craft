import { atom, read, update } from 'claude-code'
import type { Register, StateDollar } from 'claude-code'

import {
  attentionAfterTurn,
  bind,
  CLOSED,
  failOpen,
  refresh,
  statusText,
  UNBOUND,
  waitingOnYou,
  WORKING,
} from './bind'
import type { Host, Patch } from './bind'
import type { ProgressState, ProgressView } from './state'

const SHAPE = 'progress-3'
const BASH_TOOL = 'Bash'
const ASK_TOOL = 'AskUserQuestion'
const EMPTY: ProgressState = {
  envelope: null,
  runsDir: { kind: 'unknown' },
  binding: null,
  locateMiss: null,
  gate: null,
  view: null,
  attention: '',
}

const progress = atom({ plugin: 'craft', key: 'progress' } as const, EMPTY, {
  shape: SHAPE,
})

type Ctx = Host & StateDollar
type MainLoopEnvelope = { transcript_path: string; cwd: string }

function showStatus($: Ctx, before: ProgressState, after: ProgressState) {
  const text = statusText(after)
  if (text !== statusText(before)) $.ui.status(text)
}

// Merging the patch into the current value keeps a write made by another hook while
// this one awaited I/O; replacing the whole state would drop it.
async function commit($: Ctx, patch: Patch): Promise<ProgressState> {
  if (Object.keys(patch).length === 0) return read($, progress)
  let before = EMPTY
  const after = await update($, progress, current => {
    before = current
    return { ...current, ...patch }
  })
  showStatus($, before, after)
  return after
}

async function cacheEnvelope($: Ctx, e: MainLoopEnvelope) {
  const { envelope } = await read($, progress)
  const isSame =
    envelope?.transcriptPath === e.transcript_path && envelope.cwd === e.cwd
  if (isSame) return
  const next = { transcriptPath: e.transcript_path, cwd: e.cwd }
  await commit($, { envelope: next, locateMiss: null })
}

async function bindAndRefresh($: Ctx) {
  const bound = await commit($, await bind($, await read($, progress)))
  await commit($, await refresh($, bound))
}

async function refreshBound($: Ctx) {
  const state = await read($, progress)
  if (state.binding === null) return
  await commit($, await refresh($, state))
}

async function setAttention(
  $: Ctx,
  attention: (view: ProgressView) => Promise<string> | string,
) {
  const state = await read($, progress)
  const { binding, view } = state
  if (binding === null || view === null || state.attention === CLOSED) return
  await commit($, { attention: await attention(view) })
}

async function onSessionEnd($: Ctx) {
  await commit($, { ...UNBOUND, envelope: null, locateMiss: null })
}

async function onTurnStart($: Ctx) {
  const { attention } = await read($, progress)
  if (attention === CLOSED) return commit($, UNBOUND)
  await bindAndRefresh($)
  await setAttention($, () => WORKING)
}

async function onSessionCompact($: Ctx) {
  await commit($, { gate: null })
  await bindAndRefresh($)
}

// Every hook of a parallel tool batch runs before the batch's results reach the
// transcript, so its misses can exhaust the retries; by the turn's end they are written.
async function forgetLocateMiss($: Ctx) {
  const { locateMiss } = await read($, progress)
  if (locateMiss !== null) await commit($, { locateMiss: null })
}

async function onTurnComplete($: Ctx) {
  await forgetLocateMiss($)
  await bindAndRefresh($)
  await setAttention($, view => attentionAfterTurn($, view))
}

async function onAsk($: Ctx) {
  await bindAndRefresh($)
  await setAttention($, waitingOnYou)
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

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await failOpen($, 'turn.start', () => onTurnStart($))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await failOpen($, 'turn.complete', () => onTurnComplete($))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== ASK_TOOL) return next(e)
    await failOpen($, 'tool.call', () => onAsk($))
    try {
      return await next(e)
    } finally {
      await failOpen($, 'tool.call', () => setAttention($, () => WORKING))
    }
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    await failOpen($, 'session.compact', () => onSessionCompact($))
    return compacted
  })

  on('session.end', async ($, e, next) => {
    await failOpen($, 'session.end', () => onSessionEnd($))
    return next(e)
  })
}
