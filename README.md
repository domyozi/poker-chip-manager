# Pocket Pot MCP Workflow

This repository now includes an MCP-based workflow under `mcp/` for:
- posting major release updates to X
- collecting X feedback
- triaging to P0-P3 work
- syncing GitHub Issues + Project
- generating `PROGRESS.md` and `ROADMAP.md`

## Setup
1. Install dependencies
```bash
npm install
```
2. Copy env template
```bash
cp .env.example .env
```
3. Fill required values in `.env` for X/GitHub API mode
4. Keep defaults for safe start (use mock adapters first)

Notes:
- `.env` is auto-loaded by the app, no `source .env` is required.
- `--apply` is required for side effects.
- For X posting in API mode, both bearer token and OAuth 1.0a credentials are required.

## Commands
- Start MCP server:
```bash
npm run mcp
```
- Run triage (dry-run):
```bash
npm run triage
```
- Run triage with apply:
```bash
npm run triage -- --apply
```
- Post release tweet preview:
```bash
npm run release
```
- Post release tweet apply:
```bash
npm run release -- --apply
```
- Sync UI version from `package.json`:
```bash
npm run version:sync
```
- Check version consistency:
```bash
npm run version:check
```
- One-command release apply (sync + post):
```bash
npm run release:auto
```
- Generate reports:
```bash
npm run reports
```
- Run tests:
```bash
npm test
```

## Safety Model
- Dry-run is default.
- External side effects require `--apply`.
- Auto-issue creation is restricted to strict P0/P1 evidence rules.
- Every run is logged under `logs/YYYY-MM-DD.log`.

## Main Paths
- `mcp/src/server.ts`
- `mcp/src/pipeline/run-triage.ts`
- `mcp/src/release/run-release.ts`
- `triage/inbox.json`
- `triage/inbox.md`
- `triage/confirm.json`

## Release Version Policy
- Single source of truth is `package.json#version`.
- UI version (`js/app.js` `APP_VERSION`) must match `v${package.json.version}`.
- `npm run release` (without `--version`) now uses `package.json` version automatically.
