#!/bin/sh
# Restore a backup made by backup.sh into the database (DESTRUCTIVE: replaces existing objects).
#   docker compose exec -T backup sh -c 'pg_restore --clean --if-exists --no-owner -d "$PGDATABASE"' < backups/<file>.dump
# or, with PG* variables set locally:
#   ./scripts/restore.sh backups/<file>.dump
set -eu
[ $# -eq 1 ] || { echo "usage: $0 <file.dump>"; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="${PGDATABASE:-booking_db}" "$1"
echo "restored $1"
