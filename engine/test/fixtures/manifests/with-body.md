---
pipeline:
  profile: lean
---

# Repo workflow

Rationale prose. The block below is YAML-shaped on purpose: it must NOT reach the
parser — the bin extracts only the frontmatter, so the declared profile stays `lean`,
never the `solo` written here in the body.

```yaml
pipeline:
  profile: solo
```
