import { atom, read, update } from 'claude-code'
import type { Register, StateDollar } from 'claude-code'

import {
  attentionAfterTurn,
  bind,
  CLOSED,
  failOpen,
  refresh,
  unbind,
  waitingOnYou,
  WORKING,
  withAttention,
} from './bind'
import type { Host } from './bind'
import { PANE, PANE_TITLE, progressPane } from './pane'
import type { ProgressState, ProgressView } from './state'

const SHAPE = 'progress-1'
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

function cacheEnvelope($: Ctx, e: MainLoopEnvelope) {
  return update($, progress, state => ({
    ...state,
    envelope: { transcriptPath: e.transcript_path, cwd: e.cwd },
  }))
}

async function openPaneOnce($: Ctx, surface: Surface) {
  const state = await read($, progress)
  if (!surface.isDocked || state.binding === null || state.isPaneOpened) return
  await update($, progress, current => ({ ...current, isPaneOpened: true }))
  await $.ui.open({ id: PANE, title: PANE_TITLE })
}

async function bindAndRefresh($: Ctx, surface: Surface) {
  const state = await read($, progress)
  const next = await refresh($, await bind($, state))
  await update($, progress, () => next)
  await openPaneOnce($, surface)
}

async function refreshBound($: Ctx) {
  const state = await read($, progress)
  if (state.binding === null) return
  const next = await refresh($, state)
  await update($, progress, () => next)
}

async function setAttention(
  $: Ctx,
  attention: (view: ProgressView) => Promise<string> | string,
) {
  const state = await read($, progress)
  const { binding, view } = state
  if (binding === null || view === null || state.attention === CLOSED) return
  const next = withAttention($, state, await attention(view))
  await update($, progress, () => next)
}

async function resetProgress($: Ctx) {
  const state = await read($, progress)
  await update($, progress, () => unbind($, state))
}

async function onSessionEnd($: Ctx) {
  const state = await read($, progress)
  await update($, progress, () => ({ ...unbind($, state), envelope: null }))
}

async function onTurnStart($: Ctx, surface: Surface) {
  const { attention } = await read($, progress)
  if (attention === CLOSED) return resetProgress($)
  await bindAndRefresh($, surface)
  await setAttention($, () => WORKING)
}

async function onSessionCompact($: Ctx, surface: Surface) {
  await update($, progress, state => ({ ...state, gate: null }))
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
