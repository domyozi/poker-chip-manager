# Release Process

## 0) Single Source of Truth
- Canonical version is `package.json#version`.
- UI label in `js/app.js` is synchronized from `package.json`.

## 1) Prepare changelog
- Bump package version: `npm version patch` (or `minor` / `major`)
- Run sync: `npm run version:sync`
- Ensure `CHANGELOG.md` has a section like `## vX.Y.Z` where `vX.Y.Z == v${package.json.version}`.
- Optional guard: `npm run version:check`

## 2) Preview tweet
- `npm run release`

## 3) Apply tweet
- `npm run release -- --apply`
- Or use one command: `npm run release:auto`

## 4) Collect feedback
- `npm run triage`
- Review `triage/inbox.md`

## 5) Confirm and sync
- Edit `triage/confirm.json`
- `npm run triage -- --apply`

## 6) Generate reports
- `npm run reports`
