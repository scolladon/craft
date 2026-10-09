# Design — shout flag for greet.sh

> Brief: add a `--shout` flag to greet.sh that uppercases the greeting.
> Status: accepted

## Context

greet.sh prints `Hello, <name>!` for its first argument, `world` when the argument is absent.
test/greet.test.sh checks the default greeting.

## Requirements

1. `greet.sh --shout Ada` prints `HELLO, ADA!`.
2. `greet.sh Ada` still prints `Hello, Ada!`.
3. `greet.sh ''` prints `Hello, world!`.

## Design

- `--shout` is an optional first argument; the name stays the next positional argument.
- The greeting is piped through `tr '[:lower:]' '[:upper:]'` when the flag is set.

## Decision candidates

none.

## Test strategy

One `check` line per requirement in test/greet.test.sh.

## Out of scope

- Other flags: not requested.
