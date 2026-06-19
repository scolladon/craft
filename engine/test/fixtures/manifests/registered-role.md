---
extends:
  agents:
    - acme:bench-runner
phases:
  implementation:
    role: acme:bench-runner
---

# Repo workflow

This fixture registers acme:bench-runner via extends.agents and uses it as the
implementation phase role. The external ref is registered, so the bin must accept it
and return exit 0.
