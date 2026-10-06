# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: draft → self-reviewed ×1 → accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` by default. It has no flags
and no tests. The uppercasing mechanism is decided in docs/adr/001-shout-flag-uppercases.md.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.
3. `greet.sh --shout` with no name prints `HELLO, WORLD!`.

## Design

- `--shout` is an optional first argument; the name stays the next positional argument.
- The greeting is built once, then piped through `tr '[:lower:]' '[:upper:]'` when the flag is
  set.
- Files: greet.sh (changed), test/greet.test.sh (new).

## Decision candidates

none — fully pre-decided by docs/adr/001-shout-flag-uppercases.md.

## Test strategy

test/greet.test.sh runs greet.sh for the three requirements and compares stdout. Each test is
written failing before greet.sh changes.

## Out of scope

- Other flags: not requested.
- Localised greetings: not requested.
