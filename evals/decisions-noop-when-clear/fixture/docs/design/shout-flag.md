# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: draft → self-reviewed ×1 → accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` by default. It must stay
portable to bash 3.2 (docs/adr/001-greet-stays-bash-3-portable.md).

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.

## Design

`--shout` is an optional first argument. The greeting is built once, then uppercased by the
mechanism chosen in decision candidate 1.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | How greet.sh uppercases the greeting | (a) pipe the finished line through `tr '[:lower:]' '[:upper:]'`; (b) bash 4 `${greeting^^}`; (c) `awk '{print toupper($0)}'` | **(a)** | Aligns with docs/adr/001-greet-stays-bash-3-portable.md: (b) is bash 4 only, and (a) is the simplest POSIX tool for the job. |

## Test strategy

A bash test runs greet.sh with and without `--shout` and compares stdout.

## Out of scope

- Other flags: not requested.
