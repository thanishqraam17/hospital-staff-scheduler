-- =====================================================
-- tests.sql : test cases for constraints, triggers and transactions
-- Run AFTER advanced.sql. Every test is wrapped in BEGIN ... ROLLBACK,
-- so the data is unchanged afterwards. "ERROR" lines are EXPECTED
-- where the test says "should fail".
-- =====================================================

\echo ''
\echo '=== TEST 1 (should fail): double booking - same staff in two overlapping shifts ==='
BEGIN;
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT (SELECT shift_id FROM shift
        WHERE department_id = 2 AND shift_date = CURRENT_DATE AND shift_type = 'Morning'),
       a.staff_id
FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE sh.department_id = 1 AND sh.shift_date = CURRENT_DATE
  AND sh.shift_type = 'Morning' AND a.status <> 'Cancelled'
LIMIT 1;
ROLLBACK;

\echo ''
\echo '=== TEST 2 (should fail): rest rule - Night yesterday, Evening today (8 h gap) ==='
BEGIN;
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT (SELECT shift_id FROM shift
        WHERE department_id = 1 AND shift_date = CURRENT_DATE AND shift_type = 'Evening'),
       a.staff_id
FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE sh.department_id = 1 AND sh.shift_date = CURRENT_DATE - 1
  AND sh.shift_type = 'Night' AND a.status <> 'Cancelled'
LIMIT 1;
ROLLBACK;

\echo ''
\echo '=== TEST 3 (should fail): assigning a shift during approved leave ==='
BEGIN;
INSERT INTO shift (department_id, shift_date, shift_type, start_time, end_time)
VALUES (1, CURRENT_DATE + 40, 'Morning',
        (CURRENT_DATE + 40) + TIME '07:00', (CURRENT_DATE + 40) + TIME '15:00');
INSERT INTO leave_request (staff_id, start_date, end_date, reason, status)
VALUES (3, CURRENT_DATE + 39, CURRENT_DATE + 41, 'Test leave', 'Approved');
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT shift_id, 3 FROM shift
WHERE department_id = 1 AND shift_date = CURRENT_DATE + 40 AND shift_type = 'Morning';
ROLLBACK;

\echo ''
\echo '=== TEST 4 (should fail): weekly hour cap ==='
BEGIN;
UPDATE staff SET max_weekly_hours = 8 WHERE staff_id = 4;
INSERT INTO shift (department_id, shift_date, shift_type, start_time, end_time)
VALUES (1, CURRENT_DATE + 50, 'Morning',
        (CURRENT_DATE + 50) + TIME '07:00', (CURRENT_DATE + 50) + TIME '15:00'),
       (1, CURRENT_DATE + 51, 'Morning',
        (CURRENT_DATE + 51) + TIME '07:00', (CURRENT_DATE + 51) + TIME '15:00');
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT shift_id, 4 FROM shift WHERE department_id = 1 AND shift_date = CURRENT_DATE + 50;
\echo '(first 8-hour shift accepted, second one should be rejected)'
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT shift_id, 4 FROM shift WHERE department_id = 1 AND shift_date = CURRENT_DATE + 51;
ROLLBACK;

\echo ''
\echo '=== TEST 5 (should fail): CHECK constraints ==='
INSERT INTO checkin_note (staff_id, note_text, mood_rating) VALUES (1, 'Test', 7);
INSERT INTO leave_request (staff_id, start_date, end_date) VALUES (1, CURRENT_DATE, CURRENT_DATE - 3);
INSERT INTO staff (full_name, role_title, email, hire_date, department_id)
VALUES ('Test User', 'Surgeon', 'x@hospital.in', CURRENT_DATE, 1);

\echo ''
\echo '=== TEST 6 (should fail): foreign key - staff in a non-existent department ==='
INSERT INTO staff (full_name, role_title, email, hire_date, department_id)
VALUES ('Test User', 'Nurse', 'y@hospital.in', CURRENT_DATE, 99);

\echo ''
\echo '=== TEST 7 (should pass): leave approval auto-cancels shifts in that period ==='
BEGIN;
INSERT INTO shift (department_id, shift_date, shift_type, start_time, end_time)
VALUES (2, CURRENT_DATE + 60, 'Morning',
        (CURRENT_DATE + 60) + TIME '07:00', (CURRENT_DATE + 60) + TIME '15:00');
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT shift_id, 9 FROM shift WHERE department_id = 2 AND shift_date = CURRENT_DATE + 60;
INSERT INTO leave_request (staff_id, start_date, end_date, reason)
VALUES (9, CURRENT_DATE + 59, CURRENT_DATE + 61, 'Test leave');
\echo 'Before approval:'
SELECT a.assignment_id, a.staff_id, a.status FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id WHERE sh.shift_date = CURRENT_DATE + 60;
UPDATE leave_request SET status = 'Approved'
WHERE staff_id = 9 AND start_date = CURRENT_DATE + 59;
\echo 'After approval:'
SELECT a.assignment_id, a.staff_id, a.status FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id WHERE sh.shift_date = CURRENT_DATE + 60;
ROLLBACK;

\echo ''
\echo '=== TEST 8 (should pass): overtime trigger recalculates burnout score ==='
BEGIN;
\echo 'Before:'
SELECT staff_id, week_start, overtime_hours, score, risk_level FROM burnout_score
WHERE staff_id = 2 ORDER BY week_start DESC LIMIT 1;
INSERT INTO overtime_log (staff_id, shift_id, hours)
SELECT 2, a.shift_id, 8 FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE a.staff_id = 2 AND a.status <> 'Cancelled'
ORDER BY sh.shift_date DESC LIMIT 1;
\echo 'After logging 8 hours overtime:'
SELECT staff_id, week_start, overtime_hours, score, risk_level FROM burnout_score
WHERE staff_id = 2 ORDER BY week_start DESC LIMIT 1;
ROLLBACK;

\echo ''
\echo '=== TEST 9 (should pass): swap_shift procedure swaps two staff atomically ==='
BEGIN;
INSERT INTO shift (department_id, shift_date, shift_type, start_time, end_time)
VALUES (1, CURRENT_DATE + 70, 'Morning',
        (CURRENT_DATE + 70) + TIME '07:00', (CURRENT_DATE + 70) + TIME '15:00'),
       (1, CURRENT_DATE + 75, 'Morning',
        (CURRENT_DATE + 75) + TIME '07:00', (CURRENT_DATE + 75) + TIME '15:00');
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT shift_id, 4 FROM shift WHERE department_id = 1 AND shift_date = CURRENT_DATE + 70;
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT shift_id, 5 FROM shift WHERE department_id = 1 AND shift_date = CURRENT_DATE + 75;
\echo 'Before swap:'
SELECT sh.shift_date, a.staff_id, a.status FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE sh.shift_date IN (CURRENT_DATE + 70, CURRENT_DATE + 75) ORDER BY sh.shift_date;
DO $$
DECLARE a_id INT; b_id INT;
BEGIN
    SELECT a.assignment_id INTO a_id FROM shift_assignment a
    JOIN shift sh ON sh.shift_id = a.shift_id WHERE sh.shift_date = CURRENT_DATE + 70;
    SELECT a.assignment_id INTO b_id FROM shift_assignment a
    JOIN shift sh ON sh.shift_id = a.shift_id WHERE sh.shift_date = CURRENT_DATE + 75;
    CALL swap_shift(a_id, b_id);
END;
$$;
\echo 'After swap:'
SELECT sh.shift_date, a.staff_id, a.status FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE sh.shift_date IN (CURRENT_DATE + 70, CURRENT_DATE + 75) ORDER BY sh.shift_date;
ROLLBACK;

\echo ''
\echo '=== TEST 10 (should fail): swap with a missing assignment ==='
CALL swap_shift(1, 999999);

\echo ''
\echo '=== TEST 11 (transaction rollback): an error undoes earlier changes ==='
\echo 'Leave status before:'
SELECT leave_id, staff_id, status FROM leave_request WHERE staff_id = 8;
BEGIN;
UPDATE leave_request SET status = 'Approved' WHERE staff_id = 8;
INSERT INTO checkin_note (staff_id, note_text, mood_rating) VALUES (8, 'Bad mood value', 9);
ROLLBACK;
\echo 'Leave status after (should be unchanged):'
SELECT leave_id, staff_id, status FROM leave_request WHERE staff_id = 8;
