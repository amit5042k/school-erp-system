#!/usr/bin/env bash
# "Backup first, then update": an update makes a checked database copy and an uploads snapshot before the new code
# runs; a restart without an update makes none; if the backup can't be made the update stops and nothing changes.
set -u
cd "$(dirname "$0")/.."
PORT=${UPDATE_TEST_PORT:-5396}
TMP=$(mktemp -d)
pass=0; fail=0
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  (expected $3, got $2)"; fail=$((fail+1)); fi; }
trap 'rm -rf "$TMP"' EXIT
export DB_PATH="$TMP/data/school.sqlite" UPLOAD_DIR="$TMP/data/uploads" BACKUP_DIR="$TMP/data/backups" BACKUP_DISABLED=true \
  JWT_SECRET=test-secret-0123456789abcdef TZ=Asia/Kolkata PORT=$PORT
node src/utils/seed.js --force --dev >/dev/null
mkdir -p "$UPLOAD_DIR/photos"; echo "photo" > "$UPLOAD_DIR/photos/kid.jpg"; echo "doc" > "$UPLOAD_DIR/tc.pdf"
start(){ # start, wait for health (or exit), stop; prints the exit code (0 = it ran)
  node ./src/server.js > "$TMP/log" 2>&1 & local pid=$!
  for _ in $(seq 1 40); do curl -sf "localhost:$PORT/api/health" >/dev/null && { kill $pid; wait $pid 2>/dev/null; echo 0; return; }
    kill -0 $pid 2>/dev/null || { wait $pid; echo $?; return; }; sleep 0.25; done
  kill $pid; echo timeout
}
n(){ ls "$BACKUP_DIR" 2>/dev/null | grep -c "$1"; }

echo "--- first start after an update"
check "server started" "$(start)" 0
check "database copied" "$(n '^pre-update-.*\.sqlite$')" 1
check "copy opens with the data" "$(node -e "const D=require('better-sqlite3');console.log(new D(process.argv[1],{readonly:true}).prepare('select count(*) c from students').get().c>0)" "$(ls -d $BACKUP_DIR/pre-update-*.sqlite)")" true
check "uploaded files snapshotted" "$(find "$BACKUP_DIR"/pre-update-*-uploads -type f | wc -l | tr -d ' ')" 2
echo "--- restart without an update"
sleep 1; start >/dev/null
check "no new backup" "$(n '^pre-update-.*\.sqlite$')" 1
echo "--- the next update"
echo old > "$TMP/data/.code-version"; sleep 1
check "server started" "$(start)" 0
check "second backup" "$(n '^pre-update-.*\.sqlite$')" 2
echo "--- the backup can't be made"
echo old > "$TMP/data/.code-version"; BEFORE=$(sha1sum "$DB_PATH" | cut -c1-40)
rm -rf "$TMP/blocked"; echo x > "$TMP/blocked"
check "update stopped" "$(BACKUP_DIR="$TMP/blocked/sub" start)" 1
check "says why" "$(grep -c 'UPDATE STOPPED' "$TMP/log")" 1
check "data untouched" "$(sha1sum "$DB_PATH" | cut -c1-40)" "$BEFORE"
check "still marked as not updated" "$(cat "$TMP/data/.code-version")" old
check "update goes ahead once the backup works" "$(start)/$(n '^pre-update-.*\.sqlite$')" "0/3"

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
