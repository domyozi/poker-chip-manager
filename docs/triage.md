# Triage Rules

## Priorities
- P0: cannot play / cannot join / app stuck / data corruption
- P1: game progression wrong (turn order, min-raise, blind progression)
- P2: UX/visual confusion, layout issues
- P3: nice-to-have requests

## Safe Automation
- Default mode is dry-run.
- External side effects require `--apply`.
- Auto issue creation only when:
  - Priority is P0 or P1
  - AND at least one evidence condition is true:
    - Repro steps present
    - Screenshot/video/media present
    - Repeated by >=2 unique users

## Human Confirmation
- Review `triage/inbox.md`
- Edit `triage/confirm.json`
- Re-run `npm run triage -- --apply`
