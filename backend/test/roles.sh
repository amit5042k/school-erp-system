#!/usr/bin/env bash
# Checks staff role permissions end to end. Run against a freshly seeded --dev database.
B=${B:-localhost:5000/api}; C='Content-Type: application/json'
pass=0; fail=0
j(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(eval("(x=>"+process.argv[1]+")")(JSON.parse(s)))}catch(e){console.log("ERR:"+s.slice(0,160))}})' "$1"; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
check(){ if [ "$2" = "$3" ]; then pass=$((pass+1)); else echo "FAIL  $1  (expected $3, got $2)"; fail=$((fail+1)); fi; }
tok(){ curl -s -X POST $B/auth/login -H "$C" -d "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'x.token'; }
A=$(tok admin admin123); HA="Authorization: Bearer $A"
mk(){ # name role_key → token. Saving the employee creates their login (username = official email); then set the role.
  local r=$(curl -s -X POST $B/hr/employees -H "$HA" -H "$C" -d "{\"employee_no\":\"E-$1\",\"full_name\":\"$1\",\"official_email\":\"$1@test.example\",\"department\":\"ADMIN\"}")
  local pw=$(echo "$r" | j 'x.login.created.password')
  local uid=$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='$1@test.example').id")
  curl -s -X POST $B/users/$uid/role -H "$HA" -H "$C" -d "{\"role_key\":\"$2\"}" >/dev/null
  local t=$(tok $1@test.example $pw)
  curl -s -X POST $B/auth/change-password -H "Authorization: Bearer $t" -H "$C" -d "{\"current_password\":\"$pw\",\"new_password\":\"pass4567\"}" >/dev/null
  tok $1@test.example pass4567
}
tid(){ curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='$1@test.example').linked_id"; }
SFX=$RANDOM
P=$(mk pr$SFX principal); AC=$(mk ac$SFX accountant); CL=$(mk cl$SFX clerk); IT=$(mk it$SFX it-head); ST=$(mk st$SFX staff); CO=$(mk co$SFX academic-coordinator); OS=$(mk os$SFX office-superintendent)
H(){ echo "Authorization: Bearer $1"; }

check "login returns role info" "$(curl -s -X POST $B/auth/login -H "$C" -d "{\"username\":\"ac$SFX@test.example\",\"password\":\"pass4567\"}" | j 'x.user.roleKey+"|"+x.user.roleName+"|"+x.user.perms.finance')" "accountant|Accountant|full"
check "staff picks 'Administration' on login form" "$(code -X POST $B/auth/login -H "$C" -d "{\"username\":\"pr$SFX@test.example\",\"password\":\"pass4567\",\"role\":\"admin\"}")" 200
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
check "clerk's leave list is only their own" "$(curl -s $B/leaves -H "$(H $CL)" | j "x.every(l=>l.teacher_id===$(tid cl$SFX))")" true
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
PRID=$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='pr$SFX@test.example').id")
check "IT head can't create a principal login" "$(code -X POST $B/users -H "$(H $IT)" -H "$C" -d "{\"username\":\"xp$SFX\",\"password\":\"start123\",\"role\":\"teacher\",\"role_key\":\"principal\",\"full_name\":\"x\",\"linked_id\":1}")" 403
check "IT head can't reset the principal's password" "$(code -X POST $B/users/$PRID/reset-password -H "$(H $IT)" -H "$C" -d '{"password":"taken123"}')" 403
check "IT head can't give a role Finance access" "$(code -X PUT $B/roles/teacher -H "$(H $IT)" -H "$C" -d '{"perms":{"finance":"full"}}')" 403
check "IT head can still give a login the Teacher role" "$(code -X POST $B/users/$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='st$SFX@test.example').id")/role -H "$(H $IT)" -H "$C" -d '{"role_key":"teacher"}')" 200
curl -s -X POST $B/users/$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='st$SFX@test.example').id")/role -H "$HA" -H "$C" -d '{"role_key":"staff"}' >/dev/null
# Nobody below Super Admin decides their own leave or sets their own salary.
check "accountant can't change own salary structure" "$(code -X PUT $B/pay/structure/$(tid ac$SFX) -H "$(H $AC)" -H "$C" -d '{"basic":99999}')" 403
check "principal sees own payslips" "$(code $B/pay/my-slips -H "$(H $P)")" 200
# Every staff member sees their own in/out times (timing only), even with no HR access; nobody else's.
check "non-teaching staff sees own in/out timing" "$(code $B/hr/my-timing -H "$(H $ST)")" 200
check "non-teaching staff can't see staff attendance" "$(code "$B/hr/staff-attendance?date=2026-01-05" -H "$(H $ST)")" 403
check "timing shows no attendance status" "$(curl -s $B/hr/my-timing -H "$(H $CL)" | j "JSON.stringify(x).includes('status')")" false
# Fine-grained switches: the level stays, individual kinds of action can be switched off per area.
curl -s -X PUT $B/roles/clerk -H "$(H $P)" -H "$C" -d '{"actions":{"students":{"delete":false},"front-office":{"export":false}}}' >/dev/null
check "clerk with Delete off can't delete a student" "$(code -X DELETE $B/students/999999 -H "$(H $CL)")" 403
check "clerk with Delete off: message names the action" "$(curl -s -X DELETE $B/students/999999 -H "$(H $CL)" | j 'x.code')" ACTION_DENIED
check "clerk can still add (not blocked by the switch)" "$([ "$(code -X POST $B/students -H "$(H $CL)" -H "$C" -d '{}')" != 403 ] && echo ok)" ok
check "role info carries the switches" "$(curl -s $B/auth/me -H "$(H $CL)" | j 'x.actions.students.delete')" false
curl -s -X PUT $B/roles/office-superintendent -H "$(H $P)" -H "$C" -d '{"actions":{"hr":{"approve":false}}}' >/dev/null
LV=$(curl -s -X POST $B/leaves -H "$HA" -H "$C" -d '{"teacher_id":1,"leave_type":"Casual Leave","from_date":"2027-01-11","to_date":"2027-01-11","reason":"x"}' | j 'x.id')
check "office supdt with Approve off can't decide leave" "$(code -X POST $B/leaves/$LV/decision -H "$(H $OS)" -H "$C" -d '{"action":"approve"}')" 403
curl -s -X PUT $B/roles/accountant -H "$(H $P)" -H "$C" -d '{"actions":{"accounts":{"export":false}}}' >/dev/null
check "accountant with Export off can't download Tally XML" "$(code "$B/accounts/tally/vouchers.xml?from=2026-04-01&to=2027-03-31" -H "$(H $AC)")" 403
check "accountant can still view accounts" "$(code $B/accounts/summary -H "$(H $AC)")" 200
curl -s -X PUT $B/roles/academic-coordinator -H "$(H $P)" -H "$C" -d '{"actions":{"hr":{"add":false}}}' >/dev/null
check "coordinator with HR Add off still applies own leave (self-service)" "$(code -X POST $B/leaves -H "$(H $CO)" -H "$C" -d '{"leave_type":"Casual Leave","from_date":"2027-02-01","to_date":"2027-02-01","reason":"x"}')" 201
curl -s -X PUT $B/roles/it-head -H "$HA" -H "$C" -d '{"actions":{"library":{"export":false}}}' >/dev/null
check "IT head can't create a role with an action they lack" "$(code -X POST $B/roles -H "$(H $IT)" -H "$C" -d '{"name":"Lib '$SFX'","perms":{"library":"standard"}}')" 403
check "IT head can create it with that action off" "$(code -X POST $B/roles -H "$(H $IT)" -H "$C" -d '{"name":"Lib '$SFX'","perms":{"library":"standard"},"actions":{"library":{"export":false}}}')" 201
curl -s -X PUT $B/roles/it-head -H "$HA" -H "$C" -d '{"actions":{"library":{"export":true}}}' >/dev/null
for r in clerk office-superintendent accountant academic-coordinator; do curl -s -X PUT $B/roles/$r -H "$(H $P)" -H "$C" -d '{"actions":{"students":{"delete":true},"front-office":{"export":true},"hr":{"approve":true,"add":true},"accounts":{"export":true}}}' >/dev/null; done
# Staff logins are created from the employee record, named after the official email.
NE=$(curl -s -X POST $B/hr/employees -H "$HA" -H "$C" -d "{\"employee_no\":\"N$SFX\",\"full_name\":\"Neha Kapoor\",\"official_email\":\"Neha.K$SFX@School.example\",\"email\":\"neha.personal$SFX@gmail.example\",\"designation\":\"PGT Chemistry\"}")
check "saving an employee creates their login named after their email" "$(echo "$NE" | j 'x.login.created.username')" "neha.k$SFX@school.example"
check "teaching post starts with the Teacher role" "$(echo "$NE" | j 'x.login.created.role_key')" teacher
NOMAIL=$(curl -s -X POST $B/hr/employees -H "$HA" -H "$C" -d "{\"employee_no\":\"M$SFX\",\"full_name\":\"Ram Lal\",\"email\":\"ramlal.home$SFX@gmail.example\",\"designation\":\"Peon\"}")
check "personal email only: employee saved, no login yet" "$(echo "$NOMAIL" | j '!!x.login.skipped')" true
MID=$(echo "$NOMAIL" | j 'x.id')
check "Users page can't make a staff login without an email" "$(code -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"ramlal\",\"password\":\"start123\",\"role\":\"teacher\",\"full_name\":\"Ram Lal\",\"linked_id\":$MID}")" 400
check "adding the official email later creates the login" "$(curl -s -X PUT $B/hr/employees/$MID -H "$HA" -H "$C" -d "{\"official_email\":\"ram$SFX@school.example\"}" | j 'x.login.created.role_key')" staff
check "changing the official email renames the login" "$(curl -s -X PUT $B/hr/employees/$MID -H "$HA" -H "$C" -d "{\"official_email\":\"ramlal$SFX@school.example\"}" | j 'x.login.renamed')" "ramlal$SFX@school.example"
check "bulk: logins for all staff with an official email" "$(curl -s -X POST $B/users/staff-logins -H "$HA" | j 'Array.isArray(x.created)&&Array.isArray(x.skipped)')" true
# Staff directory: personal details (bank, PAN, Aadhaar, address, personal email) only for admins and the person.
SU=$(tok ADM2025001 student123)
check "students don't see staff bank details" "$(curl -s $B/teachers -H "$(H $SU)" | j 'x.some(t=>"bank_account" in t || "pan_no" in t || "email" in t)')" false
check "colleagues don't see each other's bank details" "$(curl -s $B/teachers -H "$(H $CL)" | j "x.filter(t=>t.id!==$(tid cl$SFX)).some(t=>'bank_account' in t)")" false
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
check "users list shows role names" "$(curl -s $B/users -H "$HA" | j "x.find(u=>u.username==='ac$SFX@test.example').role_name")" Accountant
# Students/parents unaffected
S=$(tok ADM2025001 student123)
check "student still blocked from fees list" "$(code $B/fees -H "$(H $S)")" 403
check "student still sees own fees" "$(code $B/fees/student/1 -H "$(H $S)")" 200
# Deleting logins.
uidof(){ curl -s $B/users -H "$HA" | j "(x.find(u=>u.username==='$1')||{}).id"; }
check "can't delete your own login" "$(code -X DELETE $B/users/$(uidof admin) -H "$HA")" 400
check "IT head can't delete the principal's login" "$(code -X DELETE $B/users/$(uidof pr$SFX@test.example) -H "$(H $IT)")" 403
check "old staff logins are listed (usernames that aren't emails)" "$(curl -s $B/users/old-staff-logins -H "$HA" | j "x.some(u=>u.username==='ritu') && !x.some(u=>u.username.includes('@'))")" true
check "admin deletes a login" "$(code -X DELETE $B/users/$(uidof os$SFX@test.example) -H "$HA")" 200
check "a deleted login is signed out at once" "$(code $B/auth/me -H "$(H $OS)")" 401
OSTID=$(curl -s "$B/teachers" -H "$HA" | j "x.find(t=>t.employee_no==='E-os$SFX').id")
curl -s -o /dev/null -X PUT $B/hr/employees/$OSTID -H "$HA" -H "$C" -d '{"phone":"9876500000"}'
check "editing the staff record doesn't bring a deleted login back" "$(uidof os$SFX@test.example)" undefined
check "a new official email does create a login again" "$(curl -s -X PUT $B/hr/employees/$OSTID -H "$HA" -H "$C" -d "{\"official_email\":\"os2$SFX@test.example\"}" | j 'x.login.created.username')" "os2$SFX@test.example"
curl -s -X PUT $B/roles/it-head -H "$HA" -H "$C" -d '{"actions":{"administration":{"delete":false}}}' >/dev/null
check "Delete off blocks the bulk delete (sent as POST)" "$(code -X POST $B/users/old-staff-logins/delete -H "$(H $IT)")" 403
curl -s -X PUT $B/roles/it-head -H "$HA" -H "$C" -d '{"actions":{"administration":{"delete":true}}}' >/dev/null
check "bulk-deleting old staff logins" "$(curl -s -X POST $B/users/old-staff-logins/delete -H "$HA" | j "x.deleted.includes('ritu')")" true
check "none left afterwards" "$(curl -s $B/users/old-staff-logins -H "$HA" | j 'x.length')" 0
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
