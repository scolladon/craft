---
phases:
  implementation:
    role: acme:tdd-specialist
---

# Repo workflow

This fixture carries an external namespace role (acme:tdd-specialist) with no
extends block to register it. External refs fail closed — an unregistered ref
is rejected and the bin returns exit 2.
