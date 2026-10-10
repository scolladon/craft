# Design — shout flag and name trimming for greet.sh

> Brief: add a `--shout` flag to greet.sh, and trim spaces around the name.
> Status: accepted

## Context

greet.sh prints `Hello, <name>!`. It takes the name from `resolve_name` in lib/name.sh, which prints its first argument, `world` when the argument is absent. test/greet.test.sh checks the default greeting.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.
3. `resolve_name ''` prints `world`.
4. `resolve_name ' Ada '` prints `Ada`.

## Design

- `--shout` is an optional first argument of greet.sh; the name stays the next positional argument. The greeting is piped through `tr '[:lower:]' '[:upper:]'` when the flag is set.
- Name handling stays in lib/name.sh: greet.sh does not inspect the name.

## Decision candidates

none.

## Test strategy

One check per requirement in test/greet.test.sh: `check` for greet.sh, `check_name` for resolve_name.

## Out of scope

- Other flags: not requested.
