# Plan — shout flag

> Source: design doc `docs/design/shout-flag.md` · ADRs none

## Part 1 — Empty-name fallback and the --shout flag

### Context

- `greet.sh`: prints `Hello, <name>!` for its first argument, `world` when it is absent.
- `test/greet.test.sh`: one `check "<title>" "<expected>" [args…]` line per test, before the final `exit` line. The helper runs greet.sh with the args and compares stdout. Use the titles exactly as the steps give them.
- Gate: `bash test/greet.test.sh` (exit 0 when every check passes).

### TDD steps

1. GUARD — `check "greets the world for an empty name" "Hello, world!" ""`. Passes because greet.sh already falls back to `world` for an empty name.
2. RED — `check "shouts the greeting" "HELLO, ADA!" --shout Ada`. Fails because greet.sh treats `--shout` as the name and prints `Hello, --shout!`.
3. GREEN — in greet.sh, when the first argument is `--shout`, drop it and uppercase the greeting with `tr '[:lower:]' '[:upper:]'`.
4. GUARD — `check "keeps the plain greeting" "Hello, Ada!" Ada`. Passes because step 3 leaves the unflagged path unchanged.
5. REFACTOR — build the greeting once, then uppercase it only when the flag is set.

### Gate

`bash test/greet.test.sh`

### Commit

`feat(greet): add a --shout flag`
