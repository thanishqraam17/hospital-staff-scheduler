-- =====================================================
-- queries.sql : DML operations and important queries
-- Run AFTER seed.sql
-- =====================================================

-- ---------------- DML ----------------

\echo '=== INSERT: new leave request ==='
INSERT INTO leave_request (staff_id, start_date, end_date, reason)
VALUES (4, CURRENT_DATE + 8, CURRENT_DATE + 9, 'Personal work')
RETURNING leave_id, staff_id, start_date, end_date, status;

\echo '=== UPDATE: approve a pending leave ==='
UPDATE leave_request
SET status = 'Approved'
WHERE staff_id = 3 AND status = 'Pending'
RETURNING leave_id, staff_id, status;

\echo '=== DELETE: remove rejected leave requests ==='
DELETE FROM leave_request
WHERE status = 'Rejected'
RETURNING leave_id, staff_id, reason;

\echo '=== SELECT: today''s roster ==='
SELECT d.name AS department, sh.shift_type, s.full_name, s.role_title
FROM shift_assignment a
JOIN shift sh     ON sh.shift_id = a.shift_id
JOIN staff s      ON s.staff_id = a.staff_id
JOIN department d ON d.department_id = sh.department_id
WHERE sh.shift_date = CURRENT_DATE
ORDER BY d.name, sh.start_time;

-- ------------- JOIN + GROUP BY + HAVING + ORDER BY + aggregates -------------

\echo '=== Hours worked per staff in the last 7 days (shift + overtime) ==='
SELECT s.staff_id, s.full_name, d.name AS department,
       COUNT(a.assignment_id) AS shifts,
       SUM(EXTRACT(EPOCH FROM (sh.end_time - sh.start_time)) / 3600)
         + COALESCE((SELECT SUM(o.hours) FROM overtime_log o
                     WHERE o.staff_id = s.staff_id
                       AND o.logged_at >= CURRENT_DATE - 6), 0) AS total_hours
FROM staff s
JOIN department d        ON d.department_id = s.department_id
JOIN shift_assignment a  ON a.staff_id = s.staff_id
JOIN shift sh            ON sh.shift_id = a.shift_id
WHERE sh.shift_date >= CURRENT_DATE - 6
GROUP BY s.staff_id, s.full_name, d.name
ORDER BY total_hours DESC;

\echo '=== Staff with more than 5 night shifts in 28 days (HAVING) ==='
SELECT s.full_name, COUNT(*) AS night_shifts
FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
JOIN staff s  ON s.staff_id = a.staff_id
WHERE sh.shift_type = 'Night'
GROUP BY s.full_name
HAVING COUNT(*) > 5
ORDER BY night_shifts DESC;

\echo '=== Overtime summary per department ==='
SELECT d.name AS department,
       COUNT(DISTINCT o.staff_id) AS staff_with_overtime,
       SUM(o.hours)  AS total_overtime,
       ROUND(AVG(o.hours), 2) AS avg_overtime_entry,
       MAX(o.hours)  AS max_single_entry
FROM overtime_log o
JOIN staff s      ON s.staff_id = o.staff_id
JOIN department d ON d.department_id = s.department_id
GROUP BY d.name
ORDER BY total_overtime DESC;

\echo '=== Departments where average mood is below 3 ==='
SELECT d.name AS department, ROUND(AVG(c.mood_rating), 2) AS avg_mood, COUNT(*) AS notes
FROM checkin_note c
JOIN staff s      ON s.staff_id = c.staff_id
JOIN department d ON d.department_id = s.department_id
GROUP BY d.name
HAVING AVG(c.mood_rating) < 3
ORDER BY avg_mood;

-- ---------------- Nested / correlated subqueries ----------------

\echo '=== Nested: staff with a pending leave request ==='
SELECT staff_id, full_name, role_title
FROM staff
WHERE staff_id IN (SELECT staff_id FROM leave_request WHERE status = 'Pending');

\echo '=== Correlated: staff whose overtime exceeds their department average ==='
SELECT s.staff_id, s.full_name, s.department_id,
       (SELECT COALESCE(SUM(o.hours), 0) FROM overtime_log o
        WHERE o.staff_id = s.staff_id) AS my_overtime
FROM staff s
WHERE (SELECT COALESCE(SUM(o.hours), 0) FROM overtime_log o
       WHERE o.staff_id = s.staff_id)
    > (SELECT AVG(t.total)
       FROM (SELECT s2.staff_id, COALESCE(SUM(o2.hours), 0) AS total
             FROM staff s2
             LEFT JOIN overtime_log o2 ON o2.staff_id = s2.staff_id
             WHERE s2.department_id = s.department_id
             GROUP BY s2.staff_id) t)
ORDER BY my_overtime DESC;

\echo '=== Correlated EXISTS: staff with no check-in note in the last 7 days ==='
SELECT s.staff_id, s.full_name
FROM staff s
WHERE NOT EXISTS (SELECT 1 FROM checkin_note c
                  WHERE c.staff_id = s.staff_id
                    AND c.created_at >= NOW() - INTERVAL '7 days')
ORDER BY s.staff_id;

-- ---------------- Recursive CTE ----------------

\echo '=== Recursive CTE: longest run of consecutive working days per staff ==='
WITH RECURSIVE work_days AS (
    SELECT DISTINCT a.staff_id, sh.shift_date
    FROM shift_assignment a
    JOIN shift sh ON sh.shift_id = a.shift_id
    WHERE a.status = 'Assigned'
),
streak AS (
    -- anchor: days that start a run (no work the previous day)
    SELECT w.staff_id, w.shift_date AS start_date, w.shift_date AS cur_date, 1 AS len
    FROM work_days w
    WHERE NOT EXISTS (SELECT 1 FROM work_days p
                      WHERE p.staff_id = w.staff_id
                        AND p.shift_date = w.shift_date - 1)
    UNION ALL
    -- recursive step: extend the run by one day
    SELECT st.staff_id, st.start_date, w.shift_date, st.len + 1
    FROM streak st
    JOIN work_days w ON w.staff_id = st.staff_id
                    AND w.shift_date = st.cur_date + 1
)
SELECT s.full_name, MAX(st.len) AS max_consecutive_days
FROM streak st
JOIN staff s ON s.staff_id = st.staff_id
GROUP BY s.full_name
ORDER BY max_consecutive_days DESC, s.full_name;
