---
subjects:
  - engine/bin/*.js
  - engine/test/*.bin.test.js
phases: [implementation, review]
kind: trap
trigger: writing a bin whose stdout can exceed 64 KiB and is read through a pipe
evidence:
  - engine/test/rulings-hint.bin.test.js
  - engine/bin/rulings-hint.js
source: { run: doctrine-register, phase: review, date: 2026-11-20 }
status: active
supersedes: []
last-verified: 2026-11-20
---
# 014 — `process.exit` right after a stdout write truncates piped output

## Context

A new bin printed an 83 KB slice. Redirected to a file it was complete; piped (`| wc -c`) it stopped at 65,536 bytes. The bin called `process.exit(main(...))` right after `stdout.write`, and on macOS a write to a pipe is asynchronous, so the process ended before the pipe drained.

## Lesson

`process.exit` does not wait for pending stdout writes to a pipe. Output up to the pipe buffer (64 KiB) arrives; the rest is lost, with exit code 0 and no error.

## How to apply

- In a bin shim, set `process.exitCode = main(...)` and let the event loop drain.
- Never call `process.exit` after writing output.
- Test a large-output bin by piping it and comparing the byte count with a length computed from the fixture.
- Never compare against another pipe: it truncates the same way.

## Evidence

`engine/bin/rulings-hint.js` sets `process.exitCode`; `engine/test/rulings-hint.bin.test.js` pipes a slice larger than the pipe buffer and asserts every byte arrives — it fails on every run when the shim is reverted to `process.exit(main(...))`.
