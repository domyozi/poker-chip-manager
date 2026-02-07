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
3. Keep defaults for safe start (`DRY_RUN=true`, mock adapters)

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
npm run release -- --version v0.0.0
```
- Post release tweet apply:
```bash
npm run release -- --version v0.0.0 --apply
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
