export type ProgressChild = { label: string; status: string; note: string }

export type ProgressItem = {
  id: string
  status: 'pending' | 'in_progress' | 'completed'
  note: string
  children: ProgressChild[]
}

export type ProgressView = {
  run: string
  source: 'effective' | 'ledger-only'
  items: ProgressItem[]
  inFlight: string[]
  next: string | null
  background: { phase: string; pid: number }[]
  warnings: string[]
}

export type Envelope = { transcriptPath: string; cwd: string }
export type RunsDir =
  | { kind: 'unknown' }
  | { kind: 'unavailable' }
  | { kind: 'known'; path: string }
export type Binding = { runId: string }
export type LedgerGate = { mtimeMs: number; size: number }
export type LocateMiss = { signature: string; attempts: number }

export type ProgressState = {
  envelope: Envelope | null
  runsDir: RunsDir
  binding: Binding | null
  locateMiss: LocateMiss | null
  gate: LedgerGate | null
  view: ProgressView | null
  attention: string
  isPaneOpened: boolean
}

declare module 'claude-code' {
  interface PluginState {
    craft: { progress: { shape: string; value: ProgressState } }
  }
}
