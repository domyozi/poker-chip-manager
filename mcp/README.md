# MCP Workflow

This folder contains an MCP-style automation workflow for:
- posting release updates to X
- collecting mentions/replies/quotes
- triaging feedback into P0-P3 candidates
- creating/updating GitHub issues + project items
- generating PROGRESS and ROADMAP from GitHub issues

## Commands
- `npm run mcp`
- `npm run triage`
- `npm run triage -- --apply`
- `npm run release -- --version v0.0.0`
- `npm run release -- --version v0.0.0 --apply`
- `npm run reports`

## Safety defaults
- dry-run is default
- external side effects only with `--apply`
