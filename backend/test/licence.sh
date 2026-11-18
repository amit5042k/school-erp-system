#!/usr/bin/env bash
# Licensing end to end: a provider's licence server and a school's install, each with its own throwaway database.
# Run by test/run.sh (needs ISSUER_PORT and CLIENT_PORT free).
set -u
cd "$(dirname "$0")/.."
IP=${ISSUER_PORT:-5397}; CP=${CLIENT_PORT:-5398}
TMP=$(mktemp -d)
pass=0; fail=0
C='Content-Type: application/json'
j(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(eval("(x=>"+process.argv[1]+")")(JSON.parse(s)))}catch(e){console.log("ERR:"+s.slice(0,200))}})' "$1"; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  (expected $3, got $2)"; fail=$((fail+1)); fi; }
cleanup(){ kill $ISS $CLI 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
start(){ # name port extra-env...
  local name=$1 port=$2; shift 2
  env PORT=$port DB_PATH="$TMP/$name.sqlite" UPLOAD_DIR="$TMP/$name-up" BACKUP_DISABLED=true TZ=Asia/Kolkata \
    JWT_SECRET=test-secret-0123456789abcdef ADMIN_PASSWORD=Start#2026x "$@" node ./src/server.js > "$TMP/$name.log" 2>&1 &
  echo $!
}
ISS=$(start issuer $IP LICENSE_ISSUER=true)
CLI=$(start school $CP LICENSE_SERVER_URL=http://localhost:$IP)
for p in $IP $CP; do for _ in $(seq 1 40); do curl -sf "localhost:$p/api/health" >/dev/null && break; sleep 0.25; done; done
login(){ local t; t=$(curl -s -X POST localhost:$1/api/auth/login -H "$C" -d '{"username":"admin","password":"Start#2026x"}' | j 'x.token')
  curl -s -X POST localhost:$1/api/auth/change-password -H "Authorization: Bearer $t" -H "$C" -d '{"current_password":"Start#2026x","new_password":"Start#2026y"}' >/dev/null
  curl -s -X POST localhost:$1/api/auth/login -H "$C" -d '{"username":"admin","password":"Start#2026y"}' | j 'x.token'; }
HI="Authorization: Bearer $(login $IP)"; HC="Authorization: Bearer $(login $CP)"
I=localhost:$IP/api; S=localhost:$CP/api
newclass(){ curl -s -o /dev/null -w '%{http_code}' -X POST $S/classes -H "$HC" -H "$C" -d "{\"name\":\"C$RANDOM\",\"section\":\"A\"}"; }

echo "--- a new install runs a 30-day trial"
check "trial status" "$(curl -s $S/licence/status -H "$HC" | j 'x.status+"/"+x.days_left+"/"+x.readOnly')" "trial/30/false"
check "everything works in the trial" "$(newclass)" 201
check "the provider's own install is not limited" "$(curl -s $I/licence/status -H "$HI" | j 'x.mode+"/"+x.issuer')" "unlimited/true"

echo "--- registering an email that has no licence"
check "refused with a reason" "$(curl -s -X POST $S/licence/register -H "$HC" -H "$C" -d '{"email":"office@school.test"}' | j '/No licence is registered/.test(x.error)')" true
check "still in the trial" "$(curl -s $S/licence/status -H "$HC" | j 'x.status')" trial
check "the attempt shows on the licence server" "$(curl -s $I/licences/0/installs -H "$HI" | j 'x[0].result')" "no licence"

echo "--- licence for another web address"
LID=$(curl -s -X POST $I/licences -H "$HI" -H "$C" -d '{"email":"Office@School.test","school_name":"Test School","domain":"erp.school.test"}' | j 'x.id')
check "wrong address refused" "$(curl -s -X POST $S/licence/register -H "$HC" -H "$C" -d '{"email":"office@school.test"}' | j '/is for erp.school.test/.test(x.error)')" true
check "only the Super Admin manages licences" "$(code $I/licences)" 401

echo "--- activated licence with a plan and a student limit"
curl -s -X PUT $I/licences/$LID -H "$HI" -H "$C" -d '{"domain":"","plan_name":"Basic","areas":["students","attendance","academics","finance"],"max_students":1}' >/dev/null
check "activated" "$(curl -s -X POST $S/licence/register -H "$HC" -H "$C" -d '{"email":"office@school.test"}' | j 'x.status+"/"+x.plan.name+"/"+x.max_students')" "active/Basic/1"
check "module outside the plan refused" "$(curl -s $S/books -H "$HC" | j 'x.code')" PLAN_AREA
check "first student allowed" "$(code -X POST $S/students -H "$HC" -H "$C" -d '{"admission_no":"L1","full_name":"One","class_id":1}')" 201
check "student limit enforced" "$(code -X POST $S/students -H "$HC" -H "$C" -d '{"admission_no":"L2","full_name":"Two","class_id":1}')" 403
curl -s -X POST $S/licence/check-now -H "$HC" >/dev/null
check "provider sees the install and its students" "$(curl -s $I/licences -H "$HI" | j "x.rows.find(r=>r.id==$LID).installs+'/'+x.rows.find(r=>r.id==$LID).students")" "1/1"

echo "--- expired and suspended licences make the ERP read-only (nothing is deleted)"
curl -s -X PUT $I/licences/$LID -H "$HI" -H "$C" -d '{"areas":null,"max_students":null,"expires_on":"2020-03-31"}' >/dev/null
check "expired" "$(curl -s -X POST $S/licence/check-now -H "$HC" | j 'x.status+"/"+x.readOnly')" "expired/true"
check "changes refused" "$(newclass)" 402
check "data still readable" "$(curl -s $S/students -H "$HC" | j 'x.length')" 1
check "sign-in still works" "$(code -X POST $S/auth/login -H "$C" -d '{"username":"admin","password":"Start#2026y"}')" 200
curl -s -X PUT $I/licences/$LID -H "$HI" -H "$C" -d '{"expires_on":"","status":"suspended"}' >/dev/null
check "suspended" "$(curl -s -X POST $S/licence/check-now -H "$HC" | j 'x.status+"/"+x.readOnly')" "suspended/true"
curl -s -X PUT $I/licences/$LID -H "$HI" -H "$C" -d '{"status":"active"}' >/dev/null
check "renewed: works again" "$(curl -s -X POST $S/licence/check-now -H "$HC" | j 'x.status')/$(newclass)" "active/201"
check "a licence in use can't be deleted" "$(code -X DELETE $I/licences/$LID -H "$HI")" 409

echo "--- the trial ends"
node -e "const D=require('better-sqlite3');const d=new D('$TMP/school.sqlite');d.prepare(\"UPDATE licence_install SET email=NULL, first_start=date('now','-40 days')\").run()"
check "read-only after the trial" "$(curl -s -X POST $S/licence/check-now -H "$HC" | j 'x.status+"/"+x.readOnly')" "expired/true"
check "changes refused after the trial" "$(newclass)" 402

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
