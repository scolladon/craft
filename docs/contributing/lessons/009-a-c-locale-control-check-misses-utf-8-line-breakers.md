---
subjects:
  - scripts/run-ledger.sh
  - test/run-ledger.test.js
phases: [design, implementation, review]
kind: trap
trigger: a script refuses control characters in text it copies into a line-based record
evidence:
  - scripts/run-ledger.sh:31
  - scripts/run-ledger.sh:280
  - test/run-ledger.test.js:583
  - test/run-ledger.test.js:839
source: { run: discovered-impacts, phase: review, date: 2026-10-26 }
status: active
supersedes: []
last-verified: 2026-10-26
---
# 009 — A C-locale control check misses UTF-8 line breakers

## Context

`defer` and `verdict` copy a title and a rationale into the run ledger, one record per line. The first
fix refused control characters with `LC_ALL=C grep '[[:cntrl:]]'`. In the C locale that class is the
bytes 0x00–0x1F and 0x7F only, so the UTF-8 C1 controls (U+0080–U+009F, two bytes from `\xc2`) and the
separators U+2028/U+2029 (three bytes from `\xe2\x80`) passed. A rationale holding U+2028 then rendered
as a second, forged `TRIAGED(` record to a terminal or a model reading the ledger. The next review
cycle found it.

## Lesson

A byte-level control class is not a character-level one. Text a reader may render as a line break or
an escape includes multibyte code points the C locale never classifies. Refuse their byte sequences
explicitly next to the C0 class.

## How to apply

- Next to `[[:cntrl:]]` under `LC_ALL=C`, also refuse `\xc2[\x80-\x9f]` and `\xe2\x80[\xa8\xa9]`.
- Add refusal rows for U+0085, U+009B, U+2028 and U+2029 in every field copied into a record.
- Add accept rows for ordinary UTF-8 (`é`, `—`, `€`, NBSP) so the byte match stays anchored on lead bytes.

## Evidence

`UNICODE_CONTROL_PATTERN` at `scripts/run-ledger.sh:31` and `has_control_chars` at `:280`. The defer
refusal row at `test/run-ledger.test.js:583` and the verdict row at `:839` fail on the C0-only check.
