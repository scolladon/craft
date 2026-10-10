# Plan — shout flag and name trimming

> Source: design doc `docs/design/shout-and-trim.md` · ADRs none

## Part 1 — The --shout flag

### Context

- `greet.sh` — owned by Part 1. Prints `Hello, <name>!`; the name comes from `resolve_name` in lib/name.sh.
- `lib/name.sh` — owned by Part 2; Part 1 does not edit it. `resolve_name` prints its first argument, `world` when it is absent.
- `test/greet.test.sh` — shared: each part adds its checks before the final `exit` line. `check "<title>" "<expected>" [args…]` runs greet.sh with the args; `check_name "<title>" "<expected>" [args…]` runs `resolve_name` with them. Use the titles exactly as the steps give them.
- Gate: `bash test/greet.test.sh` (exit 0 when every check passes).

### TDD steps

1. GUARD — `check_name "resolves an empty name to world" "world" ""`. Passes because lib/name.sh already resolves an empty name to `world`; the shout path relies on it.
2. RED — `check "shouts the greeting" "HELLO, ADA!" --shout Ada`. Fails because greet.sh treats `--shout` as the name and prints `Hello, --shout!`.
3. GREEN — in greet.sh, when the first argument is `--shout`, drop it and uppercase the greeting with `tr '[:lower:]' '[:upper:]'`.
4. GUARD — `check "keeps the plain greeting" "Hello, Ada!" Ada`. Passes because step 3 leaves the unflagged path unchanged.

### Gate

`bash test/greet.test.sh`

### Commit

`feat(greet): add a --shout flag`

## Part 2 — Trim spaces around the name

### Context

- `lib/name.sh` — owned by Part 2. `resolve_name` prints its first argument, `world` when it is absent.
- `test/greet.test.sh` — shared; `check_name` runs `resolve_name`.
- Gate: `bash test/greet.test.sh`.

### TDD steps

1. RED — `check_name "trims spaces around the name" "Ada" " Ada "`. Fails because `resolve_name` prints the name as given.
2. GREEN — in lib/name.sh, strip leading and trailing spaces from the name with parameter expansion before printing it.

### Gate

`bash test/greet.test.sh`

### Commit

`feat(name): trim spaces around the name`
