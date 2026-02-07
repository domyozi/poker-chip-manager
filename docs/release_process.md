# Release Process

## 1) Prepare changelog
- Ensure `CHANGELOG.md` has a section like `## vX.Y.Z`.

## 2) Preview tweet
- `npm run release -- --version vX.Y.Z`

## 3) Apply tweet
- `npm run release -- --version vX.Y.Z --apply`

## 4) Collect feedback
- `npm run triage`
- Review `triage/inbox.md`

## 5) Confirm and sync
- Edit `triage/confirm.json`
- `npm run triage -- --apply`

## 6) Generate reports
- `npm run reports`
