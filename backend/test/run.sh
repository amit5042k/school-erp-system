#!/usr/bin/env bash
# Runs the API test suites against a throwaway server and database: npm test
set -u
cd "$(dirname "$0")/.."
PORT=${TEST_PORT:-5399}
TMP=$(mktemp -d)
export PORT DB_PATH="$TMP/test.sqlite" UPLOAD_DIR="$TMP/uploads" BACKUP_DIR="$TMP/backups" BACKUP_DISABLED=true TZ=Asia/Kolkata \
  JWT_SECRET=test-secret-0123456789abcdef CORS_ORIGIN=http://localhost:3000
cleanup() { [ -n "${SERVER:-}" ] && kill "$SERVER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

node src/utils/seed.js --force --dev >/dev/null || { echo "seed failed"; exit 1; }
node ./src/server.js > "$TMP/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 40); do curl -sf "localhost:$PORT/api/health" >/dev/null && break; sleep 0.25; done
curl -sf "localhost:$PORT/api/health" >/dev/null || { echo "server did not start"; cat "$TMP/server.log"; exit 1; }

status=0
run() {
  echo "== $1"; shift
  "$@" > "$TMP/out.txt" 2>&1; local rc=$?
  grep -E "FAIL|passed|PROBLEMS|no problems|^  " "$TMP/out.txt" || tail -5 "$TMP/out.txt"
  [ $rc -eq 0 ] || status=1
}
export B="localhost:$PORT/api" API="http://localhost:$PORT/api"
run "Regression (access control, validation, data integrity)" bash test/regression.sh
run "Every report for every role" node test/reports.js
run "Licensing (licence server and a school install)" env ISSUER_PORT=$((PORT + 1)) CLIENT_PORT=$((PORT + 2)) bash test/licence.sh
run "Backup first, then update" env UPDATE_TEST_PORT=$((PORT + 3)) bash test/update-backup.sh
# Last: it ends by deleting the demo staff logins the other suites sign in with.
run "Staff roles and permissions" bash test/roles.sh

[ $status -eq 0 ] && echo "ALL TESTS PASSED" || { echo "SOME TESTS FAILED (server log: kept below)"; tail -20 "$TMP/server.log"; }
exit $status
