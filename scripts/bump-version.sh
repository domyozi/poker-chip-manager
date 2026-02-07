#!/usr/bin/env bash
set -euo pipefail

file="js/app.js"
sw_file="sw.js"

if [[ ! -f "$file" ]]; then
  echo "bump-version: $file not found; skip." >&2
  exit 0
fi
if [[ ! -f "$sw_file" ]]; then
  echo "bump-version: $sw_file not found; skip." >&2
  exit 0
fi

current=$(grep -oE "APP_VERSION\s*=\s*\"v[0-9]+\.[0-9]+\.[0-9]+\"" "$file" | head -n1 | sed -E 's/.*"(v[0-9]+\.[0-9]+\.[0-9]+)"/\1/')
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
perl -0777 -i -pe "s/CACHE_NAME\\s*=\\s*'poker-v[0-9]+\\.[0-9]+\\.[0-9]+'/CACHE_NAME = 'poker-${next}'/g" "$sw_file"
git add "$file" >/dev/null 2>&1 || true
git add "$sw_file" >/dev/null 2>&1 || true

echo "bump-version: ${current} -> ${next}" >&2
