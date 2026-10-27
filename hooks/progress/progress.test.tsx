import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const RUNS = '/runs'
const LEDGER = `${RUNS}/demo.md`
const ENVELOPE = { transcript_path: '/t/demo.jsonl', cwd: '/work' }
const POINTER = { name: 'demo.pointer', kind: 'file', size: 1, mtimeMs: 1, isLink: false }
const ledgerEntry = (mtimeMs: number, size: number) => ({
  name: 'demo.md', kind: 'file', size, mtimeMs, isLink: false,
})
const LEDGER_LINES = [
  '# craft run record (append-only)',
  'demo resolve EFFECTIVE: workspace,design,decisions,planning,implementation,review,validation,propose,integrate',
  'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
  'demo workspace PHASE-DONE(workspace): worktree',
  'demo design PHASE-START(design): 2026-10-27T09:05:00Z',
  'demo design PHASE-DONE(design): ok',
  'demo decisions auto-skip: decisions - evaluated unnecessary (no decision candidates)',
  'demo planning PHASE-START(planning): 2026-10-27T09:10:00Z',
]
const PLANNING_DONE = 'demo planning PHASE-DONE(planning): ok'
const ledgerText = (extra: string[]) => [...LEDGER_LINES, ...extra].join('\n')
const result = (exitCode: number, stdout: string) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

type Rig = { spawned: string[][]; statuses: (string | undefined)[]; logs: string[]; reads: number }

function rig(on: On, opts: { entries: () => unknown[]; dirExit?: number; text?: () => string; locateThrows?: boolean }) {
  const state: Rig = { spawned: [], statuses: [], logs: [], reads: 0 }
  on('process.run', (_, e) => {
    state.spawned.push([...e.argv])
    const verb = e.argv[2]
    if (verb === 'dir') return result(opts.dirExit ?? 0, `${RUNS}\n`)
    if (opts.locateThrows) return { deny: 'locate exploded' }
    return result(0, `demo ${LEDGER}\n`)
  })
  on('fs.list', () => ({ value: opts.entries() }))
  on('fs.read', () => { state.reads += 1; return { value: (opts.text ?? (() => ledgerText([])))() } })
  on('ui.status', (_, e) => { state.statuses.push(e.text); return { value: undefined } })
  on('ui.log', (_, e) => { state.logs.push(`${e.to}|${e.text}`); return { value: undefined } })
  on('classic.PostToolUse', (_, e) => e)
  on('classic.SessionStart', (_, e) => e)
  return state
}

const bash = (extra: object = {}) => ({ ...ENVELOPE, tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'u', ...extra })

test('Given a runs dir with no pointer, when a main-loop Bash PostToolUse runs, then only the dir lookup is spawned and no status is set', async ($, on) => {
  const sut = rig(on, { entries: () => [] })

  await $.classic.PostToolUse(bash() as never)

  expect(sut.spawned.map(argv => argv[2])).toEqual(['dir'])
  expect(sut.statuses).toEqual([])
})

test('Given dir exits non-zero, when a second trigger runs, then nothing is spawned', async ($, on) => {
  const sut = rig(on, { entries: () => [], dirExit: 1 })
  await $.classic.PostToolUse(bash() as never)

  await $.classic.PostToolUse(bash() as never)

  expect(sut.spawned.length).toBe(1)
})

test('Given a pointer and a locate stdout, when a main-loop Bash PostToolUse runs, then the session binds and the status line is set', async ($, on) => {
  const sut = rig(on, { entries: () => [POINTER, ledgerEntry(10, 100)] })

  await $.classic.PostToolUse(bash() as never)

  expect(sut.statuses).toEqual(['craft demo · planning · 3/9'])
})

test('Given a bound session and an unchanged ledger entry, when a second trigger runs, then the ledger is not re-read', async ($, on) => {
  const sut = rig(on, { entries: () => [POINTER, ledgerEntry(10, 100)] })
  await $.classic.PostToolUse(bash() as never)

  await $.classic.PostToolUse(bash() as never)

  expect(sut.reads).toBe(1)
})

test('Given the ledger entry changed, when a trigger runs, then it is re-read and the status updates', async ($, on) => {
  let text = ledgerText([])
  let entries: unknown[] = [POINTER, ledgerEntry(10, 100)]
  const sut = rig(on, { entries: () => entries, text: () => text })
  await $.classic.PostToolUse(bash() as never)
  text = ledgerText([PLANNING_DONE])
  entries = [POINTER, ledgerEntry(11, 140)]

  await $.classic.PostToolUse(bash() as never)

  expect(sut.statuses.at(-1)).toBe('craft demo · implementation · 4/9')
})

test('Given an unbound session, when a PostToolUse carrying agent_id runs, then locate is never spawned', async ($, on) => {
  const sut = rig(on, { entries: () => [POINTER, ledgerEntry(10, 100)] })

  await $.classic.PostToolUse(bash({ agent_id: 'a1' }) as never)

  expect(sut.spawned).toEqual([])
})

test('Given a bound session, when a sub-agent PostToolUse runs and the entry changed, then it refreshes', async ($, on) => {
  let text = ledgerText([])
  let entries: unknown[] = [POINTER, ledgerEntry(10, 100)]
  const sut = rig(on, { entries: () => entries, text: () => text })
  await $.classic.PostToolUse(bash() as never)
  text = ledgerText([PLANNING_DONE])
  entries = [POINTER, ledgerEntry(11, 140)]

  await $.classic.PostToolUse(bash({ agent_id: 'a1' }) as never)

  expect(sut.statuses.at(-1)).toBe('craft demo · implementation · 4/9')
})

test('Given a non-Bash PostToolUse, when it runs, then nothing is spawned', async ($, on) => {
  const sut = rig(on, { entries: () => [POINTER, ledgerEntry(10, 100)] })

  await $.classic.PostToolUse(bash({ tool_name: 'Read' }) as never)

  expect(sut.spawned).toEqual([])
})

test('Given process.run throws on locate, when the hook runs, then it completes, no status is set and one debug line names the event and message', async ($, on) => {
  const sut = rig(on, { entries: () => [POINTER, ledgerEntry(10, 100)], locateThrows: true })

  await $.classic.PostToolUse(bash() as never)

  expect(sut.statuses).toEqual([])
  expect(sut.logs.filter(line => line.startsWith('debug|')).length).toBe(1)
  expect(sut.logs[0]).toContain('classic.PostToolUse')
  expect(sut.logs[0]).toContain('locate exploded')
})
