#!/bin/sh
# Daily PostgreSQL backup (NFR-8). Uses the PG* environment variables.
# Keeps compressed custom-format dumps for BACKUP_KEEP_DAYS days.
set -eu
DIR=${BACKUP_DIR:-/backups}
KEEP=${BACKUP_KEEP_DAYS:-7}
mkdir -p "$DIR"
FILE="$DIR/${PGDATABASE:-booking_db}-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$FILE.tmp"
mv "$FILE.tmp" "$FILE"
echo "$(date -Iseconds) backup written: $FILE ($(du -h "$FILE" | cut -f1))"
find "$DIR" -name '*.dump' -type f -mtime +"$KEEP" -print -delete
