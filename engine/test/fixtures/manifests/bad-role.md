---
phases:
  implementation:
    role: craft:plannr
---

# Repo workflow

This fixture carries a typo in the role name (craft:plannr instead of craft:planner)
to trigger the roleExists guard when the bin wires a real predicate.
