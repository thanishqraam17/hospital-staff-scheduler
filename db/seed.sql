-- =====================================================
-- seed.sql : sample data for Hospital Staff Scheduler
-- Safe to re-run: clears tables first.
-- Shifts are generated for the last 28 days.
-- =====================================================
BEGIN;

TRUNCATE app_user, checkin_note, burnout_score, overtime_log,
         leave_request, shift_assignment, shift, staff, department
RESTART IDENTITY CASCADE;

-- Departments
INSERT INTO department (name, min_staff_per_shift) VALUES
('Emergency', 1),
('ICU', 1),
('Pediatrics', 1),
('Cardiology', 1);

-- Staff (5 per department)
INSERT INTO staff (full_name, role_title, email, hire_date, max_weekly_hours, department_id) VALUES
('Ananya Iyer',      'Doctor',     'ananya.iyer@hospital.in',     '2019-06-01', 48, 1),
('Rahul Menon',      'Nurse',      'rahul.menon@hospital.in',     '2021-02-15', 48, 1),
('Sneha Kulkarni',   'Nurse',      'sneha.kulkarni@hospital.in',  '2022-08-10', 44, 1),
('Arjun Reddy',      'Technician', 'arjun.reddy@hospital.in',     '2020-11-20', 48, 1),
('Meera Nair',       'Doctor',     'meera.nair@hospital.in',      '2018-03-05', 48, 1),
('Karthik Rao',      'Doctor',     'karthik.rao@hospital.in',     '2017-09-12', 48, 2),
('Divya Shetty',     'Nurse',      'divya.shetty@hospital.in',    '2020-01-25', 48, 2),
('Rohan Gupta',      'Nurse',      'rohan.gupta@hospital.in',     '2023-04-18', 40, 2),
('Priya Hegde',      'Technician', 'priya.hegde@hospital.in',     '2021-07-30', 48, 2),
('Vikram Joshi',     'Doctor',     'vikram.joshi@hospital.in',    '2016-12-01', 48, 2),
('Lakshmi Pillai',   'Doctor',     'lakshmi.pillai@hospital.in',  '2019-10-14', 48, 3),
('Aditya Bhat',      'Nurse',      'aditya.bhat@hospital.in',     '2022-03-22', 44, 3),
('Kavya Srinivas',   'Nurse',      'kavya.srinivas@hospital.in',  '2021-05-09', 48, 3),
('Nikhil Das',       'Technician', 'nikhil.das@hospital.in',      '2020-08-17', 48, 3),
('Pooja Verma',      'Doctor',     'pooja.verma@hospital.in',     '2018-11-03', 48, 3),
('Suresh Kumar',     'Doctor',     'suresh.kumar@hospital.in',    '2015-04-27', 48, 4),
('Ishita Banerjee',  'Nurse',      'ishita.banerjee@hospital.in', '2022-01-11', 48, 4),
('Manoj Patil',      'Nurse',      'manoj.patil@hospital.in',     '2023-06-05', 40, 4),
('Riya Desai',       'Technician', 'riya.desai@hospital.in',      '2021-09-19', 48, 4),
('Harish Gowda',     'Doctor',     'harish.gowda@hospital.in',    '2017-02-08', 48, 4);

-- Shifts: 3 per day per department for the last 28 days
-- Morning 07:00-15:00, Evening 15:00-23:00, Night 23:00-07:00 (next day)
INSERT INTO shift (department_id, shift_date, shift_type, start_time, end_time, required_staff)
SELECT d.department_id,
       g::date,
       t.shift_type,
       g::date + t.start_offset,
       g::date + t.start_offset + INTERVAL '8 hours',
       1
FROM department d
CROSS JOIN generate_series(CURRENT_DATE - 27, CURRENT_DATE, INTERVAL '1 day') AS g
CROSS JOIN (VALUES ('Morning', INTERVAL '7 hours'),
                   ('Evening', INTERVAL '15 hours'),
                   ('Night',   INTERVAL '23 hours')) AS t(shift_type, start_offset);

-- Assignments: rotating pattern Morning -> Evening -> Night -> 2 days off
-- (k = staff position in department, i = day number, t = shift number)
WITH s AS (
    SELECT staff_id, department_id,
           ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY staff_id) - 1 AS k
    FROM staff
), sh AS (
    SELECT shift_id, department_id,
           shift_date - (CURRENT_DATE - 27) AS i,
           CASE shift_type WHEN 'Morning' THEN 0 WHEN 'Evening' THEN 1 ELSE 2 END AS t
    FROM shift
)
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT sh.shift_id, s.staff_id
FROM sh
JOIN s ON s.department_id = sh.department_id
      AND s.k = (((sh.i - sh.t) % 5) + 5) % 5;

-- Extra Morning shifts for Ananya (staff 1) on her usual off-day -> longer streaks
INSERT INTO shift_assignment (shift_id, staff_id)
SELECT sh.shift_id, 1
FROM shift sh
WHERE sh.department_id = 1
  AND sh.shift_type = 'Morning'
  AND (sh.shift_date - (CURRENT_DATE - 27)) % 5 = 4;

-- Overtime: heavy for first staff of each department, light nights for second
INSERT INTO overtime_log (staff_id, shift_id, hours, logged_at)
SELECT a.staff_id, a.shift_id, 3.0, sh.end_time
FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE a.staff_id IN (1, 6, 11, 16)
  AND sh.shift_date >= CURRENT_DATE - 13;

INSERT INTO overtime_log (staff_id, shift_id, hours, logged_at)
SELECT a.staff_id, a.shift_id, 1.5, sh.end_time
FROM shift_assignment a
JOIN shift sh ON sh.shift_id = a.shift_id
WHERE a.staff_id IN (2, 7, 12, 17)
  AND sh.shift_type = 'Night';

-- Leave requests
INSERT INTO leave_request (staff_id, start_date, end_date, reason, status) VALUES
(3,  CURRENT_DATE + 5,  CURRENT_DATE + 7,  'Family function',      'Pending'),
(8,  CURRENT_DATE + 10, CURRENT_DATE + 12, 'Medical appointment',  'Pending'),
(13, CURRENT_DATE - 20, CURRENT_DATE - 18, 'Personal',             'Approved'),
(1,  CURRENT_DATE + 2,  CURRENT_DATE + 4,  'Rest and recovery',    'Rejected'),
(17, CURRENT_DATE + 15, CURRENT_DATE + 20, 'Vacation',             'Pending'),
(6,  CURRENT_DATE - 10, CURRENT_DATE - 9,  'Exam',                 'Approved');

-- Check-in notes (embeddings are added later in the vector step)
INSERT INTO checkin_note (staff_id, note_text, mood_rating, created_at) VALUES
(1,  'Back to back shifts this week, barely slept and feeling exhausted.', 1, NOW() - INTERVAL '2 days'),
(1,  'Too many emergency cases, I keep skipping meals during the shift.', 2, NOW() - INTERVAL '6 days'),
(2,  'Night shifts are disturbing my sleep cycle, constantly tired.', 2, NOW() - INTERVAL '3 days'),
(3,  'Good week, the team supported each other well.', 4, NOW() - INTERVAL '4 days'),
(6,  'ICU workload is overwhelming, I feel emotionally drained after every shift.', 1, NOW() - INTERVAL '1 day'),
(7,  'Patients were stable, manageable workload today.', 4, NOW() - INTERVAL '5 days'),
(8,  'Still learning the ICU protocols, a bit stressed but okay.', 3, NOW() - INTERVAL '2 days'),
(11, 'Extra hours every day, I have no time for family anymore.', 2, NOW() - INTERVAL '3 days'),
(12, 'Night duty plus overtime is wearing me out.', 2, NOW() - INTERVAL '1 day'),
(13, 'Feeling refreshed after my leave, enjoying work with kids.', 5, NOW() - INTERVAL '7 days'),
(15, 'Calm shift, had time to update patient records.', 4, NOW() - INTERVAL '2 days'),
(16, 'Long surgeries and overtime, completely burnt out this week.', 1, NOW() - INTERVAL '1 day'),
(17, 'Irregular night rotation is making it hard to rest.', 2, NOW() - INTERVAL '4 days'),
(18, 'New to cardiology, seniors have been helpful.', 4, NOW() - INTERVAL '6 days'),
(20, 'Busy but balanced week, took breaks when needed.', 4, NOW() - INTERVAL '3 days');

COMMIT;
