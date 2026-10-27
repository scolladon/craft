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
import { PANE, PANE_TITLE, progressPane } from './pane'
import type { ProgressState, ProgressView } from './state'

const SHAPE = 'progress-2'
const BASH_TOOL = 'Bash'
const ASK_TOOL = 'AskUserQuestion'
const COMMAND_NAME = 'craft-progress'
const COMMAND = {
  name: COMMAND_NAME,
  description: 'Show the progress of the current craft run in a pane',
}
const EMPTY: ProgressState = {
  envelope: null,
  runsDir: { kind: 'unknown' },
  binding: null,
  locateMiss: null,
  gate: null,
  view: null,
  attention: '',
  isPaneOpened: false,
}

const progress = atom({ plugin: 'craft', key: 'progress' } as const, EMPTY, {
  shape: SHAPE,
})

type Ctx = Host & StateDollar
type Surface = { isDocked: boolean }
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

async function openPaneOnce($: Ctx, surface: Surface) {
  const state = await read($, progress)
  if (!surface.isDocked || state.binding === null || state.isPaneOpened) return
  await commit($, { isPaneOpened: true })
  await $.ui.open({ id: PANE, title: PANE_TITLE })
}

async function bindAndRefresh($: Ctx, surface: Surface) {
  const bound = await commit($, await bind($, await read($, progress)))
  await commit($, await refresh($, bound))
  await openPaneOnce($, surface)
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

async function onTurnStart($: Ctx, surface: Surface) {
  const { attention } = await read($, progress)
  if (attention === CLOSED) return commit($, UNBOUND)
  await bindAndRefresh($, surface)
  await setAttention($, () => WORKING)
}

async function onSessionCompact($: Ctx, surface: Surface) {
  await commit($, { gate: null })
  await bindAndRefresh($, surface)
}

async function onTurnComplete($: Ctx, surface: Surface) {
  await bindAndRefresh($, surface)
  await setAttention($, view => attentionAfterTurn($, view))
}

async function onAsk($: Ctx, surface: Surface) {
  await bindAndRefresh($, surface)
  await setAttention($, waitingOnYou)
}

async function onMainLoop($: Ctx, surface: Surface, e: MainLoopEnvelope) {
  await cacheEnvelope($, e)
  await bindAndRefresh($, surface)
}

function onBash(
  $: Ctx,
  surface: Surface,
  e: MainLoopEnvelope & { agent_id?: string },
) {
  return e.agent_id === undefined
    ? onMainLoop($, surface, e)
    : refreshBound($)
}

export const register: Register = on => {
  // Docking is only visible to a render, and a render may not write state, so the
  // AbovePrompt draw records it here; after a reload it reads false until the next draw.
  const surface: Surface = { isDocked: false }

  on('classic.SessionStart', async ($, e, next) => {
    await failOpen($, 'classic.SessionStart', async () => {
      await $.command.register(COMMAND)
      await onMainLoop($, surface, e)
    })
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    if (e.tool_name === BASH_TOOL) {
      await failOpen($, 'classic.PostToolUse', () => onBash($, surface, e))
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await failOpen($, 'turn.start', () => onTurnStart($, surface))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await failOpen($, 'turn.complete', () => onTurnComplete($, surface))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== ASK_TOOL) return next(e)
    await failOpen($, 'tool.call', () => onAsk($, surface))
    try {
      return await next(e)
    } finally {
      await failOpen($, 'tool.call', () => setAttention($, () => WORKING))
    }
  })

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    await failOpen($, 'session.compact', () => onSessionCompact($, surface))
    return compacted
  })

  on('session.end', async ($, e, next) => {
    await failOpen($, 'session.end', () => onSessionEnd($))
    return next(e)
  })

  on('command.run', { command: COMMAND_NAME }, async $ => {
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: 'craft run progress pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    surface.isDocked = e.viewport?.isFullscreen === true
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const { view } = await read($, progress)
    if (view === null) return next(e)
    return progressPane($.ui.resolve(e), view, e.props.bodyColumns)
  })
}
