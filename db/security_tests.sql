-- =====================================================
-- security_tests.sql : role-based access tests
-- Connects as hospital_app (the website's login), exactly like the app does.
-- "ERROR" lines are EXPECTED where the test says "should fail".
-- =====================================================
\connect hospital_scheduler hospital_app

\echo ''
\echo '=== SEC 1 (should pass): correct login via authenticate() ==='
SELECT * FROM authenticate('ananya', 'staff123');

\echo ''
\echo '=== SEC 2 (should return 0 rows): wrong password ==='
SELECT * FROM authenticate('ananya', 'wrongpass');

\echo ''
\echo '=== SEC 3 (should fail): hospital_app cannot read tables directly ==='
SELECT * FROM staff LIMIT 1;

\echo ''
\echo '=== SEC 4 (should fail): password hashes cannot be read directly ==='
SELECT password_hash FROM app_user LIMIT 1;

\echo ''
\echo '=== SEC 5 (should pass): Admin sees every leave request ==='
BEGIN;
SET LOCAL ROLE app_admin;
SELECT COUNT(*) AS leave_rows_visible_to_admin FROM leave_request;
ROLLBACK;

\echo ''
\echo '=== SEC 6 (should pass): Staff (Rahul, staff_id 2) sees only own rows ==='
BEGIN;
SET LOCAL ROLE app_staff;
SELECT set_config('app.staff_id', '2', true);
SELECT 'staff' AS tbl, COUNT(*) AS rows_visible FROM staff
UNION ALL SELECT 'shift_assignment', COUNT(*) FROM shift_assignment
UNION ALL SELECT 'checkin_note', COUNT(*) FROM checkin_note
UNION ALL SELECT 'burnout_score', COUNT(*) FROM burnout_score;
SELECT DISTINCT staff_id AS only_staff_id_seen FROM shift_assignment;
ROLLBACK;

\echo ''
\echo '=== SEC 7 (should fail): Staff cannot approve leave (no UPDATE privilege) ==='
BEGIN;
SET LOCAL ROLE app_staff;
SELECT set_config('app.staff_id', '2', true);
UPDATE leave_request SET status = 'Approved' WHERE staff_id = 2;
ROLLBACK;

\echo ''
\echo '=== SEC 8 (should fail): Staff cannot request leave for someone else (RLS) ==='
BEGIN;
SET LOCAL ROLE app_staff;
SELECT set_config('app.staff_id', '2', true);
INSERT INTO leave_request (staff_id, start_date, end_date, reason)
VALUES (5, CURRENT_DATE + 3, CURRENT_DATE + 4, 'Pretending to be staff 5');
ROLLBACK;

\echo ''
\echo '=== SEC 9 (should fail): Staff cannot insert an already-approved leave (RLS) ==='
BEGIN;
SET LOCAL ROLE app_staff;
SELECT set_config('app.staff_id', '2', true);
INSERT INTO leave_request (staff_id, start_date, end_date, reason, status)
VALUES (2, CURRENT_DATE + 3, CURRENT_DATE + 4, 'Self-approved', 'Approved');
ROLLBACK;

\echo ''
\echo '=== SEC 10 (should pass, 0 rows changed): Staff cannot delete another person''s note ==='
BEGIN;
SET LOCAL ROLE app_staff;
SELECT set_config('app.staff_id', '2', true);
DELETE FROM checkin_note WHERE staff_id = 1;
ROLLBACK;

\echo ''
\echo '=== SEC 11 (should fail): Staff cannot assign shifts ==='
BEGIN;
SET LOCAL ROLE app_staff;
SELECT set_config('app.staff_id', '2', true);
INSERT INTO shift_assignment (shift_id, staff_id) VALUES (1, 2);
ROLLBACK;
