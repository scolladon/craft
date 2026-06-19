---
extends:
  agents:
    - acme:bench-runner
phases:
  implementation:
    role: acme:plannr
---

# Repo workflow

This fixture carries a typo in an external role name (acme:plannr instead of a
registered ref). The extends block registers acme:bench-runner but NOT acme:plannr,
so the bin must fail closed and return exit 2 naming the phase and ref.
