#!/usr/bin/env bash
# Checks staff role permissions end to end. Run against a freshly seeded --dev database.
B=${B:-localhost:5000/api}; C='Content-Type: application/json'
pass=0; fail=0
j(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(eval("(x=>"+process.argv[1]+")")(JSON.parse(s)))}catch(e){console.log("ERR:"+s.slice(0,160))}})' "$1"; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
check(){ if [ "$2" = "$3" ]; then pass=$((pass+1)); else echo "FAIL  $1  (expected $3, got $2)"; fail=$((fail+1)); fi; }
tok(){ curl -s -X POST $B/auth/login -H "$C" -d "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'x.token'; }
A=$(tok admin admin123); HA="Authorization: Bearer $A"
mk(){ # username role_key teacher_id → token after first-login password change
  curl -s -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"$1\",\"password\":\"start123\",\"role\":\"teacher\",\"role_key\":\"$2\",\"full_name\":\"$1\",\"linked_id\":$3}" >/dev/null
  local t=$(tok $1 start123)
  curl -s -X POST $B/auth/change-password -H "Authorization: Bearer $t" -H "$C" -d '{"current_password":"start123","new_password":"pass4567"}' >/dev/null
  tok $1 pass4567
}
SFX=$RANDOM
P=$(mk pr$SFX principal 3); AC=$(mk ac$SFX accountant 4); CL=$(mk cl$SFX clerk 5); IT=$(mk it$SFX it-head 2); ST=$(mk st$SFX staff 1); CO=$(mk co$SFX academic-coordinator 2); OS=$(mk os$SFX office-superintendent 4)
H(){ echo "Authorization: Bearer $1"; }

check "login returns role info" "$(curl -s -X POST $B/auth/login -H "$C" -d "{\"username\":\"ac$SFX\",\"password\":\"pass4567\"}" | j 'x.user.roleKey+"|"+x.user.roleName+"|"+x.user.perms.finance')" "accountant|Accountant|full"
check "staff picks 'Administration' on login form" "$(code -X POST $B/auth/login -H "$C" -d "{\"username\":\"pr$SFX\",\"password\":\"pass4567\",\"role\":\"admin\"}")" 200
check "student can't log in as staff" "$(code -X POST $B/auth/login -H "$C" -d '{"username":"ADM2025001","password":"student123","role":"admin"}')" 401

# Accountant
check "accountant reads all fees" "$(code $B/fees -H "$(H $AC)")" 200
check "accountant collects (finance full)" "$(code $B/finance/student-dues/1 -H "$(H $AC)")" 200
check "accountant reads payroll" "$(code $B/payroll -H "$(H $AC)")" 200
check "accountant can't admit students" "$(code -X POST $B/students -H "$(H $AC)" -H "$C" -d '{"admission_no":"X1","full_name":"X"}')" 403
check "accountant blocked from users" "$(code $B/users -H "$(H $AC)")" 403
check "accountant sees students list (lookup)" "$(code $B/students -H "$(H $AC)")" 200
check "accountant edits fee heads list" "$(code -X POST $B/masters/fee-heads -H "$(H $AC)" -H "$C" -d "{\"name\":\"Lab Fee $SFX\"}")" 201
check "accountant sees finance reports" "$(curl -s $B/report-catalog -H "$(H $AC)" | j 'x.some(r=>r.key==="fee-pending")')" true
check "accountant runs pending fee report" "$(code "$B/report/fee-pending" -H "$(H $AC)")" 200
# Clerk
check "clerk admits a student" "$(code -X POST $B/students -H "$(H $CL)" -H "$C" -d "{\"admission_no\":\"CL$SFX\",\"full_name\":\"Clerk Kid\"}")" 201
check "clerk logs a visitor" "$(code -X POST $B/visitors -H "$(H $CL)" -H "$C" -d '{"visitor_name":"V"}')" 201
check "clerk blocked from fees" "$(curl -s $B/fees -H "$(H $CL)" | j 'x.code')" AREA_DENIED
check "clerk can't edit fee heads" "$(code -X POST $B/masters/fee-heads -H "$(H $CL)" -H "$C" -d '{"name":"Nope"}')" 403
check "clerk sees own payslips (self-service)" "$(code $B/pay/my-slips -H "$(H $CL)")" 200
CLL=$(curl -s -X POST $B/leaves -H "$(H $CL)" -H "$C" -d '{"leave_type":"Casual Leave","from_date":"2026-11-10","to_date":"2026-11-10"}' | j 'x.id')
check "clerk applies for own leave" "$([ "$CLL" -gt 0 ] 2>/dev/null && echo ok)" ok
check "clerk's leave list is only their own" "$(curl -s $B/leaves -H "$(H $CL)" | j 'x.every(l=>l.teacher_id===5)')" true
check "clerk can't approve leaves (hr none)" "$(code -X POST $B/leaves/1/decision -H "$(H $CL)" -H "$C" -d '{"action":"approve"}')" 403
check "clerk doesn't see finance reports" "$(curl -s $B/report-catalog -H "$(H $CL)" | j 'x.some(r=>r.group==="Finance")')" false
# Non-teaching staff
check "staff blocked from attendance" "$(code "$B/attendance?date=2026-10-01" -H "$(H $ST)")" 403
check "staff reads notices" "$(code $B/announcements -H "$(H $ST)")" 200
check "staff reads timetable" "$(code $B/timetable/class/1 -H "$(H $ST)")" 200
check "staff votes/sees surveys" "$(code $B/comm/surveys/open -H "$(H $ST)")" 200
check "staff blocked from marks entry" "$(code -X POST $B/marks -H "$(H $ST)" -H "$C" -d '{}')" 403
# Academic coordinator
check "coordinator full on exams settings" "$(code -X PUT $B/exam/settings -H "$(H $CO)" -H "$C" -d '{}')" "$(code -X PUT $B/exam/settings -H "$HA" -H "$C" -d '{}')"
check "coordinator edits timetable" "$(code -X POST $B/timetable -H "$(H $CO)" -H "$C" -d '{"class_id":1,"day":"Monday","period":7,"subject":"Science"}')" 200
check "coordinator blocked from fees" "$(code $B/fees -H "$(H $CO)")" 403
# Office superintendent
check "superintendent approves leaves" "$(code -X POST $B/leaves/$CLL/decision -H "$(H $OS)" -H "$C" -d '{"action":"reject","remarks":"test"}')" 200
check "superintendent can't see payroll" "$(code $B/payroll -H "$(H $OS)")" 403
# IT head
check "IT head manages users" "$(code $B/users -H "$(H $IT)")" 200
check "IT head can't create Super Admin" "$(code -X POST $B/users -H "$(H $IT)" -H "$C" -d '{"username":"evil","password":"evil123","role":"admin","full_name":"E"}')" 403
check "IT head can't reset Super Admin password" "$(code -X POST $B/users/1/reset-password -H "$(H $IT)" -H "$C" -d '{"password":"hacked1"}')" 403
check "IT head can't disable Super Admin" "$(code -X POST $B/users/1/active -H "$(H $IT)" -H "$C" -d '{"active":false}')" 403
ITID=$(curl -s $B/auth/me -H "$(H $IT)" | j 'x.id')
check "IT head can't change own role" "$(code -X POST $B/users/$ITID/role -H "$(H $IT)" -H "$C" -d '{"role_key":"principal"}')" 403
check "IT head can't edit own role perms" "$(code -X PUT $B/roles/it-head -H "$(H $IT)" -H "$C" -d '{"perms":{"finance":"full"}}')" 403
check "IT head reads backups list" "$(code $B/admin/backups -H "$(H $IT)")" 200
check "IT head blocked from fees" "$(code $B/fees -H "$(H $IT)")" 403
# URL letter case or a trailing slash must not get around a role's restrictions (Express ignores both).
check "IT head blocked from /Payments/dues" "$(code "$B/Payments/dues?student_id=1" -H "$(H $IT)")" 403
check "IT head blocked from /PAYMENTS/dues/" "$(code "$B/PAYMENTS/dues/?student_id=1" -H "$(H $IT)")" 403
check "staff blocked from /Student-Leave" "$(code $B/Student-Leave -H "$(H $ST)")" 403
check "staff blocked from /API/student-leave" "$(code ${B%/api}/API/student-leave -H "$(H $ST)")" 403
check "accountant opens accounts" "$(code $B/accounts/summary -H "$(H $AC)")" 200
check "clerk blocked from accounts" "$(code $B/accounts/summary -H "$(H $CL)")" 403
check "teacher blocked from accounts" "$(code $B/accounts/vouchers -H "$(H $CO)")" 403
# User managers below Super Admin can't hand out or take over more access than they have (IT head has no Finance).
PRID=$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='pr$SFX').id")
check "IT head can't create a principal login" "$(code -X POST $B/users -H "$(H $IT)" -H "$C" -d "{\"username\":\"xp$SFX\",\"password\":\"start123\",\"role\":\"teacher\",\"role_key\":\"principal\",\"full_name\":\"x\",\"linked_id\":1}")" 403
check "IT head can't reset the principal's password" "$(code -X POST $B/users/$PRID/reset-password -H "$(H $IT)" -H "$C" -d '{"password":"taken123"}')" 403
check "IT head can't give a role Finance access" "$(code -X PUT $B/roles/teacher -H "$(H $IT)" -H "$C" -d '{"perms":{"finance":"full"}}')" 403
check "IT head can still create a teacher login" "$(code -X POST $B/users -H "$(H $IT)" -H "$C" -d "{\"username\":\"xt$SFX\",\"password\":\"start123\",\"role\":\"teacher\",\"role_key\":\"teacher\",\"full_name\":\"x\",\"linked_id\":1}")" 201
# Nobody below Super Admin decides their own leave or sets their own salary.
check "accountant can't change own salary structure" "$(code -X PUT $B/pay/structure/4 -H "$(H $AC)" -H "$C" -d '{"basic":99999}')" 403
check "principal sees own payslips" "$(code $B/pay/my-slips -H "$(H $P)")" 200
# Every staff member sees their own in/out times, even with no HR access; nobody else's.
check "non-teaching staff sees own attendance" "$(code $B/hr/my-attendance -H "$(H $ST)")" 200
check "non-teaching staff can't see staff attendance" "$(code "$B/hr/staff-attendance?date=2026-01-05" -H "$(H $ST)")" 403
check "own attendance is the caller's record" "$(curl -s $B/hr/my-attendance -H "$(H $CL)" | j 'x.staff.id')" 5
# Principal and role editing
check "principal sees everything (payroll)" "$(code $B/payroll -H "$(H $P)")" 200
check "principal lists roles" "$(curl -s $B/roles -H "$(H $P)" | j 'x.roles.length>=8&&x.areas.length===15')" true
check "principal gives clerk finance access" "$(code -X PUT $B/roles/clerk -H "$(H $P)" -H "$C" -d '{"perms":{"finance":"full"}}')" 200
check "clerk now reads fees (no re-login)" "$(code $B/fees -H "$(H $CL)")" 200
curl -s -X PUT $B/roles/clerk -H "$(H $P)" -H "$C" -d '{"perms":{"finance":"none"}}' >/dev/null
check "and back to blocked" "$(code $B/fees -H "$(H $CL)")" 403
check "bad level rejected" "$(code -X PUT $B/roles/clerk -H "$(H $P)" -H "$C" -d '{"perms":{"finance":"godmode"}}')" 400
check "custom role created" "$(code -X POST $B/roles -H "$(H $P)" -H "$C" -d "{\"name\":\"Librarian $SFX\",\"copy_from\":\"staff\",\"perms\":{\"library\":\"full\"}}")" 201
LIBKEY="librarian-$SFX"
check "built-in role can't be deleted" "$(code -X DELETE $B/roles/clerk -H "$(H $P)")" 400
check "custom role deleted" "$(code -X DELETE $B/roles/$LIBKEY -H "$(H $P)")" 200
check "principal can't create Super Admin either" "$(code -X POST $B/users -H "$(H $P)" -H "$C" -d '{"username":"evil2","password":"evil123","role":"admin","full_name":"E"}')" 403
check "Super Admin can create Super Admin" "$(code -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"sa$SFX\",\"password\":\"super123\",\"role\":\"admin\",\"full_name\":\"SA\"}")" 201
check "users list shows role names" "$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='ac$SFX').role_name")" Accountant
# Students/parents unaffected
S=$(tok ADM2025001 student123)
check "student still blocked from fees list" "$(code $B/fees -H "$(H $S)")" 403
check "student still sees own fees" "$(code $B/fees/student/1 -H "$(H $S)")" 200
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
