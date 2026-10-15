#!/usr/bin/env sh
# Regenerates packages/shared/src/db.ts from the local Supabase database.
# Generates into a temporary file and only replaces db.ts once generation,
# lint fixes and formatting succeed, so a stopped database never leaves the
# shared types empty or half-written.
set -eu

target="packages/shared/src/db.ts"
tmp="packages/shared/src/db.next.ts"
trap 'rm -f "$tmp"' EXIT

supabase gen types typescript --local --schema public > "$tmp"
eslint --fix "$tmp"
prettier --write "$tmp" > /dev/null
mv "$tmp" "$target"
echo "Updated $target"
