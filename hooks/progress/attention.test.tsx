import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const RUNS = '/runs'
const LEDGER = `${RUNS}/demo.md`
const ENVELOPE = { transcript_path: '/t/demo.jsonl', cwd: '/work' }
const POINTER = { name: 'demo.pointer', kind: 'file', size: 1, mtimeMs: 1, isLink: false }
const ENTRIES = [POINTER, { name: 'demo.md', kind: 'file', size: 100, mtimeMs: 10, isLink: false }]
const PLANNING_LEDGER = [
  '# craft run record (append-only)',
  'demo resolve EFFECTIVE: workspace,planning,implementation',
  'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
  'demo workspace PHASE-DONE(workspace): worktree',
  'demo planning PHASE-START(planning): 2026-10-27T09:10:00Z',
]
const VALIDATION_LEDGER = [
  '# craft run record (append-only)',
  'demo resolve EFFECTIVE: workspace,validation,propose',
  'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
  'demo workspace PHASE-DONE(workspace): worktree',
  'demo validation PHASE-START(validation): 2026-10-27T09:05:00Z',
  'demo validation HARNESS-BG(validation:sample-technique): pid=4242 out=/tmp/x spec=none',
]
const result = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

type Rig = { statuses: (string | undefined)[]; logs: string[]; probed: string[]; seenByAsk: (string | undefined)[] }
type Opts = { ledger: string[]; killExit?: number; killDenied?: boolean }

function rig(on: On, opts: Opts) {
  const state: Rig = { statuses: [], logs: [], probed: [], seenByAsk: [] }
  on('process.run', (_, e) => {
    if (e.argv[0] === 'kill') {
      state.probed.push(e.argv.join(' '))
      return opts.killDenied ? { deny: 'kill exploded' } : result(opts.killExit ?? 0, '')
    }
    return result(0, e.argv[2] === 'dir' ? `${RUNS}\n` : `demo ${LEDGER}\n`)
  })
  on('fs.list', () => ({ value: ENTRIES }))
  on('fs.read', () => ({ value: opts.ledger.join('\n') }))
  on('ui.status', (_, e) => { state.statuses.push(e.text); return { value: undefined } })
  on('ui.log', (_, e) => { state.logs.push(`${e.to}|${e.text}`); return { value: undefined } })
  on('tool.call', () => { state.seenByAsk.push(state.statuses.at(-1)); return { result: {} } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => e as never)
  on('classic.PostToolUse', (_, e) => e)
  on('classic.SessionStart', (_, e) => e)
  return state
}

const bash = () => ({ ...ENVELOPE, tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'u' })
const turnStart = (extra: object = {}) => ({ text: 'go', turnId: 't1', ...extra })
const turnComplete = (extra: object = {}) => ({
  answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', text: '', ...extra,
})

test('Given a bound session, when turn.start runs on the main loop, then the status line ends with working', async ($, on) => {
  const sut = rig(on, { ledger: PLANNING_LEDGER })
  await $.classic.PostToolUse(bash() as never)

  await $.turn.start(turnStart() as never)

  expect(sut.statuses.at(-1)).toBe('craft demo · planning · 1/3 · working')
})

test('Given a bound session in planning, when turn.complete runs without agentId, then the status line ends with waiting on you and the phase', async ($, on) => {
  const sut = rig(on, { ledger: PLANNING_LEDGER })
  await $.classic.PostToolUse(bash() as never)
  await $.turn.start(turnStart() as never)

  await $.turn.complete(turnComplete() as never)

  expect(sut.statuses.at(-1)).toBe('craft demo · planning · 1/3 · waiting on you — planning')
})

test('Given a bound session that is working, when turn.complete runs with an agentId, then the attention is unchanged', async ($, on) => {
  const sut = rig(on, { ledger: PLANNING_LEDGER })
  await $.classic.PostToolUse(bash() as never)
  await $.turn.start(turnStart() as never)
  const before = sut.statuses.length

  await $.turn.complete(turnComplete({ agentId: 'a1' }) as never)

  expect(sut.statuses.length).toBe(before)
  expect(sut.statuses.at(-1)).toBe('craft demo · planning · 1/3 · working')
})

test('Given an unbound session, when turn.start and turn.complete run, then no status is set', async ($, on) => {
  const sut = rig(on, { ledger: PLANNING_LEDGER })

  await $.turn.start(turnStart() as never)
  await $.turn.complete(turnComplete() as never)

  expect(sut.statuses).toEqual([])
})

test('Given an in-flight validation holding an alive background pid, when turn.complete runs, then the status line ends with waiting on background and the phase', async ($, on) => {
  const sut = rig(on, { ledger: VALIDATION_LEDGER, killExit: 0 })
  await $.classic.PostToolUse(bash() as never)

  await $.turn.complete(turnComplete() as never)

  expect(sut.probed).toEqual(['kill -0 4242'])
  expect(sut.statuses.at(-1)).toBe('craft demo · validation · 1/3 · waiting on background — validation')
})

test('Given the background pid is dead, when turn.complete runs, then the status line ends with waiting on you and the phase', async ($, on) => {
  const sut = rig(on, { ledger: VALIDATION_LEDGER, killExit: 1 })
  await $.classic.PostToolUse(bash() as never)

  await $.turn.complete(turnComplete() as never)

  expect(sut.statuses.at(-1)).toBe('craft demo · validation · 1/3 · waiting on you — validation')
})

test('Given the kill probe throws, when turn.complete runs, then the pid counts as dead and one debug line names the failure', async ($, on) => {
  const sut = rig(on, { ledger: VALIDATION_LEDGER, killDenied: true })
  await $.classic.PostToolUse(bash() as never)

  await $.turn.complete(turnComplete() as never)

  expect(sut.statuses.at(-1)).toBe('craft demo · validation · 1/3 · waiting on you — validation')
  expect(sut.logs.filter(line => line.startsWith('debug|') && line.includes('kill exploded')).length).toBe(1)
})

test('Given a bound session, when an AskUserQuestion tool call is open, then the status reads waiting on you, and once it resolves, working', async ($, on) => {
  const sut = rig(on, { ledger: PLANNING_LEDGER })
  await $.classic.PostToolUse(bash() as never)
  await $.turn.start(turnStart() as never)

  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)

  expect(sut.seenByAsk).toEqual(['craft demo · planning · 1/3 · waiting on you — planning'])
  expect(sut.statuses.at(-1)).toBe('craft demo · planning · 1/3 · working')
})
