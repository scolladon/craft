# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: draft → self-reviewed ×1 → accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` by default. It must stay
portable to bash 3.2 (docs/adr/001-greet-stays-bash-3-portable.md). Some callers pipe its
output into scripts that match on `Hello`.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!` on a terminal.
2. `greet.sh Ada` still prints `Hello, Ada!`.

## Design

`--shout` is an optional first argument. The greeting is built once and piped through
`tr '[:lower:]' '[:upper:]'` (bash 3.2 portable). Its behaviour when stdout is not a terminal
is decision candidate 1.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | What `--shout` does when stdout is not a terminal | (a) shout anyway; (b) ignore `--shout` when stdout is piped, so scripts matching `Hello` keep working; (c) shout and print a warning on stderr when piped | **(a)** | Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`. Whether piped callers matter more than predictability is a product call no ADR covers. |

## Test strategy

A bash test runs greet.sh with and without `--shout`, on a terminal and piped, and compares
stdout.

## Out of scope

- Other flags: not requested.
