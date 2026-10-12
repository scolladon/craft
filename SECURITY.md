# Security policy

## Supported versions

Only the latest release receives security fixes — the newest entry in
[CHANGELOG.md](CHANGELOG.md).

## Reporting a vulnerability

**Do not include vulnerability details in a public issue, pull request or comment.**

1. Open a [security contact request](https://github.com/scolladon/craft/issues/new?template=security-contact.yml).
   It asks for a private contact and nothing else.
2. The maintainer replies in that issue with a private channel.
3. Send the details there only. The public issue is closed once you have moved over.

A blank issue can still carry details; this policy and the issue chooser link are the
mitigation.

## Scope

In scope:

- hooks under `hooks/`
- scripts craft executes in a user's repository
- guard bypasses in the shipped adapter bindings
- anything that writes outside the run's worktree

Out of scope:

- the host agent runtimes themselves
- limitations an adapter declares in [adapters/README.md](adapters/README.md), such as its
  guard posture (the aider binding declines a guard because aider has no deny surface)

The adapter bindings are portability proofs, not supported products.
