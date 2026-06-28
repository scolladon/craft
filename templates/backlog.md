# <project> — Backlog & Roadmap

> <one-line statement of what this project is and where it's headed.>
>
> SoT — *intent:* `<prd path>` · *architecture:* `<design path>` · *decisions:* `<adr dir>`
> · *build script:* `<plan path>` · *spikes:* `<spike path, or omit>`

<!-- The SoT pointers a craft run resolves intent / architecture / decisions / plan from. -->

## Status — <summary line>

<!-- The one-screen roadmap: each phase/milestone and its state. Keep it short — detail
     lives under Candidate phases. State vocabulary: ✅ done · ⏭️ next · ⬜ planned. -->

| Phase | What | State |
|---|---|---|
| <id> | <one-line scope> | <state> |

<!-- When a major milestone lands, add a callout blockquote below the table:
     > ✅ <milestone> is live. <one-line proof.> -->

## Candidate phases

<!-- Work queued for the next run or actively in progress. One unchecked `[ ]` bullet per
     deliverable, sized so a single craft run can land it. Pull these from the design/PRD. -->

- [ ] <candidate deliverable>

**Surface gate:** <the binding invariant that must still hold when this phase ships.>

## Parked

<!-- Known work intentionally not scheduled or blocked on an external trigger. Each item
     stays visible so nothing is silently dropped. -->

### Condition-gated — <category>

<!-- Items unblocked by an external trigger (a release, a dependency, a decision). Cite
     what the trigger is and which phase it naturally belongs to. -->

- [ ] <parked item> (unblocked when: <trigger>)

### Closed — <category>

<!-- Items deliberately declined. Record the rationale so the decision is followable. -->

- <declined item> (rationale: <why it was closed>)
