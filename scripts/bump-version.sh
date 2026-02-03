#!/usr/bin/env bash
set -euo pipefail

file="js/app.js"

if [[ ! -f "$file" ]]; then
  echo "bump-version: $file not found; skip." >&2
  exit 0
fi

current=$(rg -n "APP_VERSION\\s*=\\s*\"v[0-9]+\\.[0-9]+\\.[0-9]+\"" "$file" -o | head -n1 | sed -E 's/.*\"(v[0-9]+\.[0-9]+\.[0-9]+)\"/\1/')
if [[ -z "${current:-}" ]]; then
  echo "bump-version: APP_VERSION not found; skip." >&2
  exit 0
fi

ver="${current#v}"
major="${ver%%.*}"
rest="${ver#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"
next_patch=$((patch + 1))
next="v${major}.${minor}.${next_patch}"

perl -0777 -i -pe "s/APP_VERSION\\s*=\\s*\"v[0-9]+\\.[0-9]+\\.[0-9]+\"/APP_VERSION = \"${next}\"/g" "$file"
git add "$file" >/dev/null 2>&1 || true

echo "bump-version: ${current} -> ${next}" >&2
