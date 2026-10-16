#!/usr/bin/env sh
# Prints the environment to run the local stack (Supabase, web and e2e) on
# alternate ports, without editing supabase/config.toml or any tracked file.
#
#   eval "$(sh scripts/local-ports.sh 563)"          # Supabase on 563xx, web on 3020
#   eval "$(sh scripts/local-ports.sh 563 3100)"     # same, web on 3100
#
# The first argument replaces the "543" of the default ports (54321 API,
# 54322 DB, 54323 Studio, 54324 Mailpit, ...). The web port defaults to
# 3000 + (prefix - 543). The Supabase CLI reads SUPABASE_<SECTION>_<KEY>
# variables as overrides of config.toml; Next.js reads PORT and the
# NEXT_PUBLIC_* variables; Playwright reads E2E_BASE_URL and E2E_MAILPIT_URL.
# Without these variables everything keeps its default (and CI does not use
# this script). Run `supabase stop` / `supabase status` in the same shell.
set -eu

prefix="${1:-}"
case "$prefix" in
  [1-6][0-9][0-9]) ;;
  *)
    echo "usage: eval \"\$(sh scripts/local-ports.sh <prefix 100-655> [web port])\"" >&2
    exit 64
    ;;
esac
if [ "$prefix" -gt 655 ]; then
  echo "prefix must be at most 655 (ports up to 65535)" >&2
  exit 64
fi

web_port="${2:-$((3000 + prefix - 543))}"
case "$web_port" in
  '' | *[!0-9]*)
    echo "web port must be a number" >&2
    exit 64
    ;;
esac
if [ "$web_port" -lt 1024 ] || [ "$web_port" -gt 65535 ]; then
  echo "web port must be between 1024 and 65535" >&2
  exit 64
fi

api="http://127.0.0.1:${prefix}21"
web="http://127.0.0.1:${web_port}"

cat <<EOF
export SUPABASE_API_PORT='${prefix}21'
export SUPABASE_DB_PORT='${prefix}22'
export SUPABASE_DB_SHADOW_PORT='${prefix}20'
export SUPABASE_DB_POOLER_PORT='${prefix}29'
export SUPABASE_STUDIO_PORT='${prefix}23'
export SUPABASE_LOCAL_SMTP_PORT='${prefix}24'
export SUPABASE_ANALYTICS_PORT='${prefix}27'
export SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT='${prefix}83'
export SUPABASE_AUTH_SITE_URL='${web}'
export SUPABASE_AUTH_ADDITIONAL_REDIRECT_URLS='${web}/**,http://localhost:${web_port}/**,transport://auth/callback'
export PORT='${web_port}'
export SUPABASE_URL='${api}'
export NEXT_PUBLIC_SUPABASE_URL='${api}'
export NEXT_PUBLIC_SITE_URL='${web}'
export EXPO_PUBLIC_SUPABASE_URL='${api}'
export E2E_BASE_URL='${web}'
export E2E_MAILPIT_URL='http://127.0.0.1:${prefix}24'
EOF
