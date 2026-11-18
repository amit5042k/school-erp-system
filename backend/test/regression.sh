#!/usr/bin/env bash
# Verifies each reported bug is fixed. Prints PASS/FAIL per check.
B=${B:-localhost:5000/api}
C='Content-Type: application/json'
pass=0; fail=0
j(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(eval("(x=>"+process.argv[1]+")")(JSON.parse(s)))}catch(e){console.log("ERR:"+s.slice(0,200))}})' "$1"; }
tok(){ curl -s -X POST $B/auth/login -H "$C" -d "{\"username\":\"$1\",\"password\":\"$2\"}" | j 'x.token'; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  (expected $3, got $2)"; fail=$((fail+1)); fi; }
A=$(tok admin admin123); T=$(tok ritu teacher123); T2=$(tok anil teacher123); S=$(tok ADM2025001 student123)
HA="Authorization: Bearer $A"; HT="Authorization: Bearer $T"; HT2="Authorization: Bearer $T2"; HS="Authorization: Bearer $S"
SID=$(curl -s $B/auth/me -H "$HS" | j 'x.linkedId')
OTHER=$(curl -s $B/students -H "$HA" | j "x.find(s=>s.id!==$SID).id")

echo "--- 1. role checks on reads"
for p in payroll enquiries visitors complaints calls postal inventory/items communications reports/summary leave-allowances; do
  check "student blocked from /$p" "$(code $B/$p -H "$HS")" 403
done
check "teacher blocked from /payroll" "$(code $B/payroll -H "$HT")" 403
check "admin can read /payroll" "$(code $B/payroll -H "$HA")" 200
check "student sees only own student row" "$(curl -s $B/students -H "$HS" | j "x.length===1&&x[0].id===$SID")" true
echo "--- 2. own records only"
check "student blocked from other's fees" "$(code $B/fees/student/$OTHER -H "$HS")" 403
check "student can read own fees" "$(code $B/fees/student/$SID -H "$HS")" 200
check "student blocked from other's attendance" "$(code $B/attendance/student/$OTHER -H "$HS")" 403
check "student blocked from other's profile" "$(code $B/students/$OTHER -H "$HS")" 403
check "marks?student_id=other returns only own" "$(curl -s "$B/marks?student_id=$OTHER" -H "$HS" | j "x.every(r=>r.student_id===$SID)")" true
echo "--- 3. leaves"
R=$(curl -s -X POST $B/leaves -H "$HT" -H "$C" -d '{"teacher_id":999,"leave_type":"Earned Leave","from_date":"2026-11-01","to_date":"2026-11-03","status":"approved"}')
LID=$(echo "$R" | j 'x.id')
ME=$(curl -s $B/auth/me -H "$HT" | j 'x.linkedId')
L=$(curl -s $B/leaves/$LID -H "$HT")
check "teacher leave forced to own teacher_id" "$(echo "$L" | j "x.teacher_id===$ME")" true
check "status in body ignored (stays pending)" "$(echo "$L" | j 'x.status')" pending
check "PUT status=approved ignored" "$(curl -s -X PUT $B/leaves/$LID -H "$HT" -H "$C" -d '{"status":"approved","reason":"x"}' >/dev/null; curl -s $B/leaves/$LID -H "$HT" | j 'x.status')" pending
check "other teacher can't see it" "$(code $B/leaves/$LID -H "$HT2")" 404
check "other teacher can't delete it" "$(code -X DELETE $B/leaves/$LID -H "$HT2")" 403
check "teacher can't approve" "$(code -X POST $B/leaves/$LID/decision -H "$HT" -H "$C" -d '{"action":"approve"}')" 403
check "to_date before from_date rejected" "$(code -X POST $B/leaves -H "$HT" -H "$C" -d '{"leave_type":"Earned Leave","from_date":"2026-11-05","to_date":"2026-11-01"}')" 400
check "admin approves" "$(code -X POST $B/leaves/$LID/decision -H "$HA" -H "$C" -d '{"action":"approve"}')" 200
check "teacher can't edit approved leave" "$(code -X PUT $B/leaves/$LID -H "$HT" -H "$C" -d '{"reason":"y"}')" 400
check "approved leave counted in balance" "$(curl -s $B/leaves/balance/$ME -H "$HT" | j 'x.rows.find(r=>r.leave_type==="Earned Leave").availed>=3')" true
echo "--- 4. deactivation"
UID_=$(curl -s $B/users -H "$HA" | j 'x.find(u=>u.username==="anil").id')
curl -s -X POST $B/users/$UID_/active -H "$HA" -H "$C" -d '{"active":false}' >/dev/null
check "deactivated user's token rejected" "$(code $B/students -H "$HT2")" 401
curl -s -X POST $B/users/$UID_/active -H "$HA" -H "$C" -d '{"active":true}' >/dev/null
check "reactivated user works again" "$(code $B/students -H "$HT2")" 200
ADMIN_ID=$(curl -s $B/auth/me -H "$HA" | j 'x.id')
check "admin can't deactivate self" "$(code -X POST $B/users/$ADMIN_ID/active -H "$HA" -H "$C" -d '{"active":false}')" 400
echo "--- 5. fees"
FID=$(curl -s -X POST $B/fees -H "$HA" -H "$C" -d "{\"student_id\":$SID,\"term\":\"Test\",\"amount\":1000,\"due_date\":\"2026-12-31\"}" | j 'x.id')
check "negative payment rejected" "$(code -X POST $B/fees/$FID/pay -H "$HA" -H "$C" -d '{"amount":-500}')" 400
check "non-numeric payment rejected" "$(code -X POST $B/fees/$FID/pay -H "$HA" -H "$C" -d '{"amount":"abc"}')" 400
check "overpayment rejected" "$(code -X POST $B/fees/$FID/pay -H "$HA" -H "$C" -d '{"amount":1500}')" 400
check "partial payment ok" "$(curl -s -X POST $B/fees/$FID/pay -H "$HA" -H "$C" -d '{"amount":400}' | j 'x.status')" partial
check "final payment ok" "$(curl -s -X POST $B/fees/$FID/pay -H "$HA" -H "$C" -d '{"amount":600}' | j 'x.status')" paid
check "paying a paid fee rejected" "$(code -X POST $B/fees/$FID/pay -H "$HA" -H "$C" -d '{"amount":1}')" 400
check "both receipts kept" "$(curl -s $B/fees/$FID/payments -H "$HA" | j 'x.length')" 2
check "student sees own receipts" "$(code $B/fees/$FID/payments -H "$HS")" 200
check "zero fee amount rejected" "$(code -X POST $B/fees -H "$HA" -H "$C" -d "{\"student_id\":$SID,\"term\":\"T\",\"amount\":0}")" 400
OD=$(curl -s -X POST $B/fees -H "$HA" -H "$C" -d "{\"student_id\":$SID,\"term\":\"Old\",\"amount\":10,\"due_date\":\"2020-01-01\"}" | j 'x.id')
check "past-due fee shows overdue" "$(curl -s $B/fees/student/$SID -H "$HS" | j "x.find(f=>f.id===$OD).status")" overdue
echo "--- 6. inventory"
IID=$(curl -s -X POST $B/inventory/items -H "$HA" -H "$C" -d '{"sku":"VERIFY-1","name":"Chalk","qty_on_hand":10}' | j 'x.id')
check "issue more than stock rejected" "$(code -X POST $B/inventory/movements -H "$HA" -H "$C" -d "{\"item_id\":$IID,\"movement_type\":\"issue\",\"qty\":11}")" 400
check "negative purchase rejected" "$(code -X POST $B/inventory/movements -H "$HA" -H "$C" -d "{\"item_id\":$IID,\"movement_type\":\"purchase\",\"qty\":-5}")" 400
check "bad movement type rejected" "$(code -X POST $B/inventory/movements -H "$HA" -H "$C" -d "{\"item_id\":$IID,\"movement_type\":\"steal\",\"qty\":1}")" 400
curl -s -X POST $B/inventory/movements -H "$HA" -H "$C" -d "{\"item_id\":$IID,\"movement_type\":\"issue\",\"qty\":4}" >/dev/null
curl -s -X POST $B/inventory/movements -H "$HA" -H "$C" -d "{\"item_id\":$IID,\"movement_type\":\"adjust\",\"qty\":-1}" >/dev/null
check "issue 4 + adjust -1 leaves 5" "$(curl -s $B/inventory/items/$IID -H "$HA" | j 'x.qty_on_hand')" 5
check "negative stock on item rejected" "$(code -X PUT $B/inventory/items/$IID -H "$HA" -H "$C" -d '{"qty_on_hand":-3}')" 400
echo "--- 7. timetable"
for s in Maths Science; do curl -s -X POST $B/timetable -H "$HA" -H "$C" -d "{\"class_id\":1,\"day\":\"Saturday\",\"period\":8,\"subject\":\"$s\"}" >/dev/null; done
TT=$(curl -s $B/timetable/class/1 -H "$HA")
check "saving a slot twice keeps one row" "$(echo "$TT" | j 'x.filter(r=>r.day==="Saturday"&&r.period===8).length')" 1
check "second save updated subject" "$(echo "$TT" | j 'x.find(r=>r.day==="Saturday"&&r.period===8).subject')" Science
check "invalid day rejected" "$(code -X POST $B/timetable -H "$HA" -H "$C" -d '{"class_id":1,"day":"Funday","period":1,"subject":"X"}')" 400
echo "--- 8. hostel"
HID=$(curl -s -X POST $B/hostels -H "$HA" -H "$C" -d '{"name":"Verify Hostel","type":"boys"}' | j 'x.id')
RID=$(curl -s -X POST $B/hostel-rooms -H "$HA" -H "$C" -d "{\"hostel_id\":$HID,\"room_no\":\"V1\",\"capacity\":1}" | j 'x.id')
RID2=$(curl -s -X POST $B/hostel-rooms -H "$HA" -H "$C" -d "{\"hostel_id\":$HID,\"room_no\":\"V2\",\"capacity\":2}" | j 'x.id')
AID=$(curl -s -X POST $B/hostel-allotments -H "$HA" -H "$C" -d "{\"student_id\":$SID,\"room_id\":$RID}" | j 'x.id')
check "room over capacity rejected" "$(code -X POST $B/hostel-allotments -H "$HA" -H "$C" -d "{\"student_id\":$OTHER,\"room_id\":$RID}")" 409
check "student in two rooms rejected" "$(code -X POST $B/hostel-allotments -H "$HA" -H "$C" -d "{\"student_id\":$SID,\"room_id\":$RID2}")" 409
check "vacate works" "$(code -X POST $B/hostel-allotments/$AID/vacate -H "$HA" -H "$C" -d '{}')" 200
check "re-allot to same room after vacating" "$(code -X POST $B/hostel-allotments -H "$HA" -H "$C" -d "{\"student_id\":$SID,\"room_id\":$RID}")" 201
echo "--- 9. persisted pages"
check "event saved" "$(code -X POST $B/events -H "$HA" -H "$C" -d '{"event_date":"2026-12-25","type":"Holiday","name":"Christmas"}')" 201
check "student can read events" "$(curl -s $B/events -H "$HS" | j 'x.some(e=>e.name==="Christmas")')" true
check "survey saved" "$(code -X POST $B/surveys -H "$HT" -H "$C" -d '{"question":"Q?","option1":"A","option2":"B","expire_date":"2026-12-31"}')" 201
check "activity saved" "$(code -X POST $B/activities -H "$HT" -H "$C" -d '{"name":"Sports Day","activity_date":"2026-11-20","file_names":"a.jpg"}')" 201
N1=$(curl -s $B/prospectus/next-no -H "$HA" | j 'x.prospectus_no')
P=$(curl -s -X POST $B/prospectus -H "$HA" -H "$C" -d '{"first_name":"Riya","gender":"F","prospectus_amount":500,"bank_charges":20,"total_amount":1}')
check "prospectus saved with server number" "$(curl -s $B/prospectus/$(echo "$P" | j 'x.id') -H "$HA" | j 'x.prospectus_no')" "$N1"
check "prospectus total computed on server" "$(curl -s $B/prospectus/$(echo "$P" | j 'x.id') -H "$HA" | j 'x.total_amount')" 520
check "prospectus number advances" "$(curl -s $B/prospectus/next-no -H "$HA" | j "x.prospectus_no!=='$N1'")" true
check "award saved" "$(code -X POST $B/awards -H "$HA" -H "$C" -d '{"recipient":"Ritu","recipient_type":"staff","title":"Best Teacher"}')" 201
check "student can post suggestion" "$(code -X POST $B/suggestions -H "$HS" -H "$C" -d '{"subject":"Canteen","body":"More fruit"}')" 201
check "student can't read suggestions" "$(code $B/suggestions -H "$HS")" 403
check "incident saved" "$(code -X POST $B/incidents -H "$HT" -H "$C" -d '{"incident_date":"2026-10-10","description":"Broken window"}' )" 403
check "admin logs incident" "$(code -X POST $B/incidents -H "$HA" -H "$C" -d '{"incident_date":"2026-10-10","description":"Broken window"}')" 201
echo "--- 10. classes"
CID=$(curl -s -X POST $B/classes -H "$HA" -H "$C" -d '{"name":"Verify","section":"Z","description":"tmp"}' | j 'x.id')
check "class update" "$(code -X PUT $B/classes/$CID -H "$HA" -H "$C" -d '{"class_teacher_id":1,"description":"d2"}')" 200
check "class description saved" "$(curl -s $B/classes -H "$HA" | j "x.find(c=>c.id===$CID).description")" d2
check "empty class delete" "$(code -X DELETE $B/classes/$CID -H "$HA")" 200
check "class with students can't be deleted" "$(code -X DELETE $B/classes/1 -H "$HA")" 409
echo "--- 11. teachers"
TID=$(curl -s -X POST $B/teachers -H "$HA" -H "$C" -d '{"employee_no":"VER-1","full_name":"V T","department":"Science"}' | j 'x.id')
curl -s -X PUT $B/teachers/$TID -H "$HA" -H "$C" -d '{"department":"Maths","photo_url":"https://x/y.png"}' >/dev/null
check "teacher department/photo saved" "$(curl -s $B/teachers/$TID -H "$HA" | j 'x.department+"|"+x.photo_url')" "Maths|https://x/y.png"
echo "--- 12. announcements"
curl -s -X POST $B/announcements -H "$HA" -H "$C" -d '{"title":"VERIFY-STU","body":"x","audience":"student"}' >/dev/null
check "admin sees student-targeted post" "$(curl -s $B/announcements -H "$HA" | j 'x.some(a=>a.title==="VERIFY-STU")')" true
check "teacher doesn't see student post" "$(curl -s $B/announcements -H "$HT" | j 'x.some(a=>a.title==="VERIFY-STU")')" false
check "student sees student post" "$(curl -s $B/announcements -H "$HS" | j 'x.some(a=>a.title==="VERIFY-STU")')" true
check "bad audience rejected" "$(code -X POST $B/announcements -H "$HA" -H "$C" -d '{"title":"x","body":"x","audience":"aliens"}')" 400
echo "--- 15. friendly errors"
BID=$(curl -s -X POST $B/books -H "$HA" -H "$C" -d '{"book_no":"VER-B1","title":"T","qty_total":2}' | j 'x.id')
check "new book qty_available defaults to total" "$(curl -s $B/books/$BID -H "$HA" | j 'x.qty_available')" 2
curl -s -X POST $B/book-issues -H "$HA" -H "$C" -d "{\"book_id\":$BID,\"student_id\":$SID}" >/dev/null
DEL=$(curl -s -X DELETE $B/books/$BID -H "$HA")
check "delete issued book gives readable 409" "$(echo "$DEL" | j '!x.error.includes("FOREIGN KEY")&&x.error.length>10')" true
check "qty_available > total rejected" "$(code -X PUT $B/books/$BID -H "$HA" -H "$C" -d '{"qty_available":9}')" 400
check "student sees only own book issues" "$(curl -s $B/book-issues -H "$HS" | j "x.every(i=>i.student_id===$SID)")" true
check "duplicate admission no gives 409" "$(code -X POST $B/students -H "$HA" -H "$C" -d '{"admission_no":"ADM2025001","full_name":"Dup"}')" 409
check "marks > max rejected" "$(code -X POST $B/marks -H "$HA" -H "$C" -d "{\"exam_id\":1,\"student_id\":$SID,\"subject\":\"Maths\",\"marks_obtained\":120,\"max_marks\":100}")" 400
check "invalid attendance status gives 400" "$(code -X POST $B/attendance/bulk -H "$HA" -H "$C" -d "{\"date\":\"2026-10-01\",\"records\":[{\"student_id\":$SID,\"status\":\"sleeping\"}]}")" 400
check "unknown api route gives JSON 404" "$(code $B/nope -H "$HA")" 404
echo "--- 16. parent"
PU=$(curl -s -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"verify_parent\",\"password\":\"parent123\",\"role\":\"parent\",\"full_name\":\"Parent V\",\"linked_id\":$SID}" | j 'x.id')
P0=$(tok verify_parent parent123)
check "new parent must change password first" "$(code $B/dashboard -H "Authorization: Bearer $P0")" 403
curl -s -X POST $B/auth/change-password -H "Authorization: Bearer $P0" -H "$C" -d '{"current_password":"parent123","new_password":"parent456"}' >/dev/null
P_=$(tok verify_parent parent456)
check "parent dashboard shows child" "$(curl -s $B/dashboard -H "Authorization: Bearer $P_" | j "x.student&&x.student.id===$SID")" true
check "parent sees child fees" "$(code $B/fees/student/$SID -H "Authorization: Bearer $P_")" 200
check "parent blocked from other child" "$(code $B/fees/student/$OTHER -H "Authorization: Bearer $P_")" 403
echo "--- low"
check "wrong role + wrong password: generic msg" "$(curl -s -X POST $B/auth/login -H "$C" -d '{"username":"admin","password":"wrongpass","role":"student"}' | j 'x.error')" "Invalid credentials"
check "short reset password rejected" "$(code -X POST $B/users/$UID_/reset-password -H "$HA" -H "$C" -d '{"password":"1"}')" 400
check "user with bad role rejected" "$(code -X POST $B/users -H "$HA" -H "$C" -d '{"username":"zz","password":"zzzzzz","role":"god","full_name":"Z"}')" 400
check "teacher user needs a linked teacher" "$(code -X POST $B/users -H "$HA" -H "$C" -d '{"username":"zz","password":"zzzzzz","role":"teacher","full_name":"Z"}')" 400
echo "--- results stay with the class they were earned in after promotion"
P1=$(curl -s -X POST $B/classes -H "$HA" -H "$C" -d '{"name":"Promo 1","section":"Z"}' | j 'x.id')
P2=$(curl -s -X POST $B/classes -H "$HA" -H "$C" -d '{"name":"Promo 2","section":"Z"}' | j 'x.id')
K1=$(curl -s -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"PRM1\",\"full_name\":\"Promo Kid\",\"class_id\":$P1}" | j 'x.id')
K2=$(curl -s -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"PRM2\",\"full_name\":\"Stay Kid\",\"class_id\":$P1}" | j 'x.id')
EX=$(curl -s -X POST $B/exams -H "$HA" -H "$C" -d '{"name":"Promo Exam","start_date":"2026-09-01","end_date":"2026-09-05"}' | j 'x.id')
curl -s -X POST $B/exam/marks/bulk -H "$HA" -H "$C" -d "{\"exam_id\":$EX,\"class_id\":$P1,\"subject\":\"English\",\"rows\":[{\"student_id\":$K1,\"marks_obtained\":80},{\"student_id\":$K2,\"marks_obtained\":50}]}" >/dev/null
curl -s -X PUT $B/exam/publish -H "$HA" -H "$C" -d "{\"exam_id\":$EX,\"class_id\":$P1,\"marks_published\":true,\"result_published\":true}" >/dev/null
check "promote" "$(code -X POST $B/academic/promote -H "$HA" -H "$C" -d "{\"from_session\":\"2026-2027\",\"to_session\":\"2027-2028\",\"items\":[{\"student_id\":$K1,\"result\":\"promoted\",\"to_class_id\":$P2}]}")" 201
check "old class card still has the promoted student" "$(curl -s "$B/exam/report-card?class_id=$P1&exam_id=$EX" -H "$HA" | j "x.cards.map(c=>c.student.full_name+'@'+c.student.class_name).join()")" "Promo Kid@Promo 1,Stay Kid@Promo 1"
check "new class card doesn't take last year's marks" "$(curl -s "$B/exam/report-card?class_id=$P2&exam_id=$EX" -H "$HA" | j 'x.cards.length')" 0
check "one student's card uses the exam's class" "$(curl -s "$B/exam/report-card?student_id=$K1&exam_id=$EX" -H "$HA" | j 'x.class.id')" "$P1"
check "award list keeps the promoted student" "$(curl -s "$B/exam/award-list?class_id=$P1&exam_id=$EX" -H "$HA" | j 'x.students.filter(s=>s.total>0).length')" 2
check "marks count by exam class" "$(curl -s "$B/exam/marks-count?class_id=$P1&exam_id=$EX" -H "$HA" | j 'x[0].count')" 2
curl -s -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"promo_kid\",\"password\":\"promo123\",\"role\":\"student\",\"full_name\":\"Promo Kid\",\"linked_id\":$K1}" >/dev/null
PK0=$(tok promo_kid promo123)
curl -s -X POST $B/auth/change-password -H "Authorization: Bearer $PK0" -H "$C" -d '{"current_password":"promo123","new_password":"promo456"}' >/dev/null
PK=$(tok promo_kid promo456)
check "promoted student still sees last year's published card" "$(curl -s "$B/exam/report-card?exam_id=$EX" -H "Authorization: Bearer $PK" | j 'x.cards.length')" 1
check "promoted student still sees last year's marks" "$(curl -s "$B/exam/my-marks" -H "Authorization: Bearer $PK" | j 'x.length')" 1
echo "--- online test attempts stay with the student after a class change"
P3=$(curl -s -X POST $B/classes -H "$HA" -H "$C" -d '{"name":"OT Class","section":"Q"}' | j 'x.id')
K3=$(curl -s -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"OT1\",\"full_name\":\"OT Kid\",\"class_id\":$P3}" | j 'x.id')
curl -s -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"ot_kid\",\"password\":\"otkid123\",\"role\":\"student\",\"full_name\":\"OT Kid\",\"linked_id\":$K3}" >/dev/null
OK0=$(tok ot_kid otkid123); curl -s -X POST $B/auth/change-password -H "Authorization: Bearer $OK0" -H "$C" -d '{"current_password":"otkid123","new_password":"otkid456"}' >/dev/null
HK="Authorization: Bearer $(tok ot_kid otkid456)"
ST=$(node -e 'console.log(new Date(Date.now()-60000).toISOString())'); EN=$(node -e 'console.log(new Date(Date.now()+3600000).toISOString())')
OT=$(curl -s -X POST $B/online-tests -H "$HA" -H "$C" -d "{\"title\":\"OT\",\"class_id\":$P3,\"start_at\":\"$ST\",\"end_at\":\"$EN\",\"duration_min\":10,\"questions\":[{\"text\":\"2+2\",\"options\":[\"3\",\"4\"],\"correct\":[1]}]}" | j 'x.id')
curl -s -X POST $B/online-tests/$OT/publish -H "$HA" -H "$C" -d '{}' >/dev/null
AT=$(curl -s -X POST $B/online-tests/$OT/start -H "$HK" -H "$C" -d '{}' | j 'x.attempt_id')
curl -s -X POST $B/online-tests/attempts/$AT/submit -H "$HK" -H "$C" -d '{"answers":{}}' >/dev/null
curl -s -X PUT $B/students/$K3 -H "$HA" -H "$C" -d "{\"class_id\":$P1}" >/dev/null
check "moved student still lists the test they took" "$(curl -s $B/online-tests/my -H "$HK" | j "x.some(t=>t.id===$OT)")" true
check "moved student can open its result" "$(code $B/online-tests/$OT/my-result -H "$HK")" 200
check "teacher results still show the moved student" "$(curl -s $B/online-tests/$OT/results -H "$HA" | j "x.students.some(s=>s.student_id===$K3)")" true
echo "--- leave overlaps and reassignment"
L1=$(curl -s -X POST $B/leaves -H "$HT" -H "$C" -d '{"leave_type":"Earned Leave","from_date":"2027-01-10","to_date":"2027-01-12"}' | j 'x.id')
check "overlapping leave refused" "$(code -X POST $B/leaves -H "$HT" -H "$C" -d '{"leave_type":"Earned Leave","from_date":"2027-01-12","to_date":"2027-01-14"}')" 409
check "admin can't move a leave to another person" "$(code -X PUT $B/leaves/$L1 -H "$HA" -H "$C" -d '{"teacher_id":999}')" 400
curl -s -X POST $B/leaves/$L1/decision -H "$HA" -H "$C" -d '{"action":"approve"}' >/dev/null
check "approved leave can't be edited" "$(code -X PUT $B/leaves/$L1 -H "$HA" -H "$C" -d '{"to_date":"2027-01-20"}')" 400
echo "--- a parent keeps their login while another child still studies here"
S1=$(curl -s -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"SIB1\",\"full_name\":\"Sib One\",\"class_id\":$P1}" | j 'x.id')
S2=$(curl -s -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"SIB2\",\"full_name\":\"Sib Two\",\"class_id\":$P1}" | j 'x.id')
PU=$(curl -s -X POST $B/users -H "$HA" -H "$C" -d "{\"username\":\"sib_parent\",\"password\":\"sibpar123\",\"role\":\"parent\",\"full_name\":\"Sib Parent\",\"linked_id\":$S1}" | j 'x.id')
curl -s -X POST $B/family/parents/$PU/children -H "$HA" -H "$C" -d "{\"student_id\":$S2}" >/dev/null
curl -s -X POST $B/stu/students/$S1/status -H "$HA" -H "$C" -d '{"status":"left","reason":"Moved city"}' >/dev/null
check "parent login still works" "$(code -X POST $B/auth/login -H "$C" -d '{"username":"sib_parent","password":"sibpar123"}')" 200
check "parent now sees the child still studying" "$(curl -s $B/users -H "$HA" | j "x.find(u=>u.id===$PU).linked_id")" "$S2"
curl -s -X POST $B/stu/students/$S2/status -H "$HA" -H "$C" -d '{"status":"left","reason":"Moved city"}' >/dev/null
check "parent login off once no child studies here" "$(code -X POST $B/auth/login -H "$C" -d '{"username":"sib_parent","password":"sibpar123"}')" 401
echo "--- a late fine is charged once, not again on every part payment"
FS=$(curl -s $B/finance/settings -H "$HA")
curl -s -X PUT $B/finance/settings -H "$HA" -H "$C" -d '{"fine_type":"flat","fine_amount":50,"grace_days":0,"max_fine":0}' >/dev/null
FST=$(curl -s -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"FINE1\",\"full_name\":\"Fine Kid\",\"class_id\":$P1}" | j 'x.id')
FID=$(curl -s -X POST $B/fees -H "$HA" -H "$C" -d "{\"student_id\":$FST,\"term\":\"Old dues\",\"amount\":1000,\"due_date\":\"2026-01-10\"}" | j 'x.id')
check "fine due before paying" "$(curl -s $B/finance/student-dues/$FST -H "$HA" | j 'x.total_fine')" 50
curl -s -X POST $B/finance/collect -H "$HA" -H "$C" -d "{\"student_id\":$FST,\"items\":[{\"fee_id\":$FID,\"amount\":400,\"fine\":50}]}" >/dev/null
check "no second fine after paying it" "$(curl -s $B/finance/student-dues/$FST -H "$HA" | j 'x.total_fine')" 0
curl -s -X PUT $B/finance/settings -H "$HA" -H "$C" -d "$FS" >/dev/null
echo "--- reports that need a choice show their filters first"
check "report without its required choice still returns filters" "$(curl -s $B/report/fee-student-ledger -H "$HA" | j "x.params.length>0&&x.rows.length===0&&/Choose Student/.test(x.message)")" true
echo "--- right password, wrong Login As"
check "says which Login As to choose" "$(curl -s -X POST $B/auth/login -H "$C" -d '{"username":"ADM2025001","password":"student123","role":"admin"}' | j 'x.code')" WRONG_LOGIN_AS
echo "--- payroll: staff who join mid-month are paid from their joining date"
JT=$(curl -s -X POST $B/hr/employees -H "$HA" -H "$C" -d '{"employee_no":"JOIN1","full_name":"New Joiner","joining_date":"2026-06-11"}' | j 'x.id')
curl -s -X PUT $B/pay/structure/$JT -H "$HA" -H "$C" -d '{"basic":30000,"pf_applicable":false,"esi_applicable":false}' >/dev/null
check "joiner's first slip is prorated" "$(curl -s -X POST $B/pay/generate -H "$HA" -H "$C" -d "{\"month\":\"2026-06\",\"teacher_ids\":[$JT],\"entries\":[{\"teacher_id\":$JT,\"lop_days\":\"\"}]}" | j 'x.total_net')" 20000
check "no slip before joining" "$(curl -s -X POST $B/pay/generate -H "$HA" -H "$C" -d "{\"month\":\"2026-05\",\"teacher_ids\":[$JT]}" | j 'x.created')" 0
echo "--- admission numbers differing only in case or spaces are refused"
check "same admission no in other case refused" "$(code -X POST $B/students -H "$HA" -H "$C" -d "{\"admission_no\":\"sib1 \",\"full_name\":\"Dup\",\"class_id\":$P1}")" 409
echo "--- accounts: cash in hand can't go below zero"
CASHL=$(curl -s $B/accounts/ledgers -H "$HA" | j "x.find(l=>l.kind==='cash').id"); EXPL=$(curl -s $B/accounts/ledgers -H "$HA" | j "x.find(l=>l.nature==='expense').id")
TD=$(node -e "console.log(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))")
check "payment beyond cash in hand refused" "$(code -X POST $B/accounts/vouchers -H "$HA" -H "$C" -d "{\"vtype\":\"payment\",\"date\":\"$TD\",\"lines\":[{\"ledger_id\":$EXPL,\"dr\":99999999},{\"ledger_id\":$CASHL,\"cr\":99999999}]}")" 400
echo "--- staff logins"
check "staff with a subject start as Teacher" "$(curl -s -X POST $B/teachers -H "$HA" -H "$C" -d '{"employee_no":"SUBJ1","full_name":"Subject Teacher","subject":"Maths","official_email":"subj1@test.example"}' | j 'x.login.created.role_key')" teacher
check "staff without a subject start as Staff" "$(curl -s -X POST $B/teachers -H "$HA" -H "$C" -d '{"employee_no":"SUBJ2","full_name":"Office Clerk","subject":"-","official_email":"subj2@test.example"}' | j 'x.login.created.role_key')" staff
echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
