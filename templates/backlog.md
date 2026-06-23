# <project> — Backlog & Roadmap

> <one-line statement of what this project is and where it's headed.>
>
> SoT — *intent:* `<prd path>` · *architecture:* `<design path>` · *decisions:* `<adr dir>`
> · *build script:* `<plan path>` · *spikes:* `<spike path, or omit>`

<!-- The SoT pointers a craft run resolves intent / architecture / decisions / plan from. -->

## Status at a glance

<!-- The one-screen roadmap: each phase/milestone and its state. Keep it short — detail
     lives under Done / Next. State vocabulary: ✅ done · ⏭️ next · ⬜ planned. -->

| Phase | What | State |
|---|---|---|
| <id> | <one-line scope> | <state> |

<!-- When a major milestone lands, add a callout blockquote below the table:
     > ✅ <milestone> is live. <one-line proof.> -->

## Done

<!-- Shipped work in chronological order (oldest phase first), grouped by phase/milestone.
     Each entry is a checked box `[x]` with a one-line outcome; nest sub-bullets per part.
     Record the ADRs/design docs each phase resolved against so the trail is followable. -->

### <phase> — <title>
- [x] <outcome, with the artifact or ADR that proves it>

## Next — <id>: <title>

<!-- The phase craft will pick up next. One unchecked `[ ]` bullet per deliverable, sized so
     a single craft run can land it. Pull these from the design/PRD, not from memory. -->

- [ ] <deliverable>

**Surface gate (<id>):** <the binding invariant that must still hold when this phase ships —
the property the scenario/characterization suite proves by construction.>

## Then

<!-- Outlined-but-not-started phases, in dependency order. One line each; promote to "Next"
     when its predecessors are green. Deliberately light — don't over-specify far-out work. -->

- **<id> — <title>:** <one-line scope + why it waits on what.>

## Deferred / parked

<!-- Known work intentionally not scheduled: production-hardening, follow-ups a phase surfaced,
     deferred halves of a decision (cite the ADR). Each stays visible so nothing is silently dropped. -->

- [ ] <parked item> (rides with <the phase it naturally belongs to>) <!-- the parenthetical is optional — name what unblocks it -->

## Notes

<!-- Durable context a future run needs and the code does not record: load-bearing conventions,
     the working style, "data is the SoT" reminders, gotchas. Convert relative dates to absolute. -->

- <durable note>
