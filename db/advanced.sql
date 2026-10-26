-- =====================================================
-- advanced.sql : functions, procedures, triggers, view
-- Run AFTER schema.sql and seed.sql
-- Advanced concepts covered:
--   1. Stored function   (calculate_burnout_score, uses a CTE)
--   2. Stored procedures (upsert_burnout, refresh_burnout_scores, swap_shift)
--   3. Triggers          (assignment validation, leave auto-cancel, overtime -> score)
--   4. View              (high_risk_staff)
--   5. Transactions      (swap_shift is atomic; see tests.sql)
--   6. Indexing          (schema.sql, incl. HNSW vector index)
-- =====================================================

-- -----------------------------------------------------
-- 1. FUNCTION: compute burnout metrics for one staff member for one week
--    Score = 2 x (hours above 40) + 5 x night shifts
--          + 10 x (consecutive days above 3) + 1.5 x overtime hours, capped at 100
--    Risk:  Low < 30, Medium 30-59, High >= 60
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_burnout_score(p_staff_id INT, p_week_start DATE)
RETURNS TABLE (total_hours NUMERIC, night_shifts INT, max_consecutive_days INT,
               overtime_hours NUMERIC, score INT, risk_level VARCHAR)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE
    v_hours  NUMERIC;
    v_nights INT;
    v_consec INT;
    v_ot     NUMERIC;
    v_score  NUMERIC;
BEGIN
    -- scheduled hours and night shifts in the week
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (sh.end_time - sh.start_time)) / 3600), 0),
           COUNT(*) FILTER (WHERE sh.shift_type = 'Night')
    INTO v_hours, v_nights
    FROM shift_assignment a
    JOIN shift sh ON sh.shift_id = a.shift_id
    WHERE a.staff_id = p_staff_id
      AND a.status <> 'Cancelled'
      AND sh.shift_date BETWEEN p_week_start AND p_week_start + 6;

    -- overtime in the week
    SELECT COALESCE(SUM(o.hours), 0)
    INTO v_ot
    FROM overtime_log o
    JOIN shift sh ON sh.shift_id = o.shift_id
    WHERE o.staff_id = p_staff_id
      AND sh.shift_date BETWEEN p_week_start AND p_week_start + 6;

    -- longest run of consecutive working days (CTE, gaps-and-islands)
    WITH days AS (
        SELECT DISTINCT sh.shift_date AS d
        FROM shift_assignment a
        JOIN shift sh ON sh.shift_id = a.shift_id
        WHERE a.staff_id = p_staff_id
          AND a.status <> 'Cancelled'
          AND sh.shift_date BETWEEN p_week_start AND p_week_start + 6
    ),
    islands AS (
        SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::INT AS grp
        FROM days
    )
    SELECT COALESCE(MAX(cnt), 0)
    INTO v_consec
    FROM (SELECT grp, COUNT(*) AS cnt FROM islands GROUP BY grp) x;

    v_score := GREATEST(0, v_hours + v_ot - 40) * 2
             + v_nights * 5
             + GREATEST(0, v_consec - 3) * 10
             + v_ot * 1.5;
    v_score := LEAST(100, ROUND(v_score));

    RETURN QUERY
    SELECT v_hours, v_nights, v_consec, v_ot, v_score::INT,
           (CASE WHEN v_score >= 60 THEN 'High'
                 WHEN v_score >= 30 THEN 'Medium'
                 ELSE 'Low' END)::VARCHAR;
END;
$$;

-- -----------------------------------------------------
-- 2a. PROCEDURE: save (insert or update) one staff member's weekly score
-- -----------------------------------------------------
CREATE OR REPLACE PROCEDURE upsert_burnout(p_staff_id INT, p_week_start DATE)
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO burnout_score (staff_id, week_start, total_hours, night_shifts,
                               max_consecutive_days, overtime_hours, score, risk_level)
    SELECT p_staff_id, p_week_start, c.*
    FROM calculate_burnout_score(p_staff_id, p_week_start) c
    ON CONFLICT (staff_id, week_start) DO UPDATE
    SET total_hours          = EXCLUDED.total_hours,
        night_shifts         = EXCLUDED.night_shifts,
        max_consecutive_days = EXCLUDED.max_consecutive_days,
        overtime_hours       = EXCLUDED.overtime_hours,
        score                = EXCLUDED.score,
        risk_level           = EXCLUDED.risk_level;
END;
$$;

-- -----------------------------------------------------
-- 2b. PROCEDURE: recompute scores for every staff member for a week
-- -----------------------------------------------------
CREATE OR REPLACE PROCEDURE refresh_burnout_scores(p_week_start DATE)
LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT staff_id FROM staff LOOP
        CALL upsert_burnout(r.staff_id, p_week_start);
    END LOOP;
END;
$$;

-- -----------------------------------------------------
-- 2c. PROCEDURE (transaction): swap the staff of two assignments atomically.
--     If any step fails (e.g. the swap breaks the rest rule), the whole
--     swap is rolled back and nothing changes.
-- -----------------------------------------------------
CREATE OR REPLACE PROCEDURE swap_shift(p_assignment_a INT, p_assignment_b INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_staff_a INT;
    v_staff_b INT;
BEGIN
    SELECT staff_id INTO v_staff_a FROM shift_assignment
    WHERE assignment_id = p_assignment_a AND status <> 'Cancelled' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment % not found or cancelled', p_assignment_a;
    END IF;

    SELECT staff_id INTO v_staff_b FROM shift_assignment
    WHERE assignment_id = p_assignment_b AND status <> 'Cancelled' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assignment % not found or cancelled', p_assignment_b;
    END IF;

    -- park B so the validation trigger does not compare A against it
    UPDATE shift_assignment SET status = 'Cancelled' WHERE assignment_id = p_assignment_b;
    UPDATE shift_assignment SET staff_id = v_staff_b, status = 'Swapped'
    WHERE assignment_id = p_assignment_a;
    UPDATE shift_assignment SET staff_id = v_staff_a, status = 'Swapped'
    WHERE assignment_id = p_assignment_b;
END;
$$;

-- -----------------------------------------------------
-- 3a. TRIGGER: validate every new or changed shift assignment
--     Rejects: approved leave, double booking, < 11 h rest, weekly hour cap
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_validate_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_shift     shift%ROWTYPE;
    v_max_hours INT;
    v_hours     NUMERIC;
BEGIN
    IF NEW.status = 'Cancelled' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_shift FROM shift WHERE shift_id = NEW.shift_id;

    -- approved leave
    IF EXISTS (SELECT 1 FROM leave_request l
               WHERE l.staff_id = NEW.staff_id
                 AND l.status = 'Approved'
                 AND v_shift.shift_date BETWEEN l.start_date AND l.end_date) THEN
        RAISE EXCEPTION 'Staff % is on approved leave on %', NEW.staff_id, v_shift.shift_date;
    END IF;

    -- double booking (overlapping shift)
    IF EXISTS (SELECT 1 FROM shift_assignment a
               JOIN shift o ON o.shift_id = a.shift_id
               WHERE a.staff_id = NEW.staff_id
                 AND a.assignment_id <> COALESCE(NEW.assignment_id, -1)
                 AND a.status <> 'Cancelled'
                 AND o.start_time < v_shift.end_time
                 AND o.end_time   > v_shift.start_time) THEN
        RAISE EXCEPTION 'Double booking: staff % already has an overlapping shift', NEW.staff_id;
    END IF;

    -- minimum 11 hours rest between shifts
    IF EXISTS (SELECT 1 FROM shift_assignment a
               JOIN shift o ON o.shift_id = a.shift_id
               WHERE a.staff_id = NEW.staff_id
                 AND a.assignment_id <> COALESCE(NEW.assignment_id, -1)
                 AND a.status <> 'Cancelled'
                 AND o.start_time < v_shift.end_time   + INTERVAL '11 hours'
                 AND o.end_time   > v_shift.start_time - INTERVAL '11 hours') THEN
        RAISE EXCEPTION 'Rest rule violated: staff % would have less than 11 hours between shifts', NEW.staff_id;
    END IF;

    -- weekly hour cap (7 days ending on this shift's date)
    SELECT max_weekly_hours INTO v_max_hours FROM staff WHERE staff_id = NEW.staff_id;

    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (o.end_time - o.start_time)) / 3600), 0)
    INTO v_hours
    FROM shift_assignment a
    JOIN shift o ON o.shift_id = a.shift_id
    WHERE a.staff_id = NEW.staff_id
      AND a.assignment_id <> COALESCE(NEW.assignment_id, -1)
      AND a.status <> 'Cancelled'
      AND o.shift_date BETWEEN v_shift.shift_date - 6 AND v_shift.shift_date;

    IF v_hours + EXTRACT(EPOCH FROM (v_shift.end_time - v_shift.start_time)) / 3600 > v_max_hours THEN
        RAISE EXCEPTION 'Weekly cap exceeded: staff % would work more than % hours in 7 days',
                        NEW.staff_id, v_max_hours;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_assignment ON shift_assignment;
CREATE TRIGGER validate_assignment
BEFORE INSERT OR UPDATE ON shift_assignment
FOR EACH ROW EXECUTE FUNCTION trg_validate_assignment();

-- -----------------------------------------------------
-- 3b. TRIGGER: when a leave is approved, cancel that staff's shifts in the leave period
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_cancel_on_leave()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE shift_assignment a
    SET status = 'Cancelled'
    FROM shift sh
    WHERE sh.shift_id = a.shift_id
      AND a.staff_id = NEW.staff_id
      AND a.status <> 'Cancelled'
      AND sh.shift_date BETWEEN NEW.start_date AND NEW.end_date;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cancel_on_leave ON leave_request;
CREATE TRIGGER cancel_on_leave
AFTER INSERT OR UPDATE OF status ON leave_request
FOR EACH ROW WHEN (NEW.status = 'Approved')
EXECUTE FUNCTION trg_cancel_on_leave();

-- -----------------------------------------------------
-- 3c. TRIGGER: logging overtime recalculates that week's burnout score
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_overtime_rescore()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_week DATE;
BEGIN
    SELECT date_trunc('week', shift_date)::DATE INTO v_week
    FROM shift WHERE shift_id = NEW.shift_id;
    CALL upsert_burnout(NEW.staff_id, v_week);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS overtime_rescore ON overtime_log;
CREATE TRIGGER overtime_rescore
AFTER INSERT ON overtime_log
FOR EACH ROW EXECUTE FUNCTION trg_overtime_rescore();

-- -----------------------------------------------------
-- 4. VIEW: high-risk staff with their weekly metrics
-- -----------------------------------------------------
CREATE OR REPLACE VIEW high_risk_staff AS
SELECT s.staff_id, s.full_name, s.role_title, d.name AS department,
       b.week_start, b.total_hours, b.night_shifts, b.max_consecutive_days,
       b.overtime_hours, b.score, b.risk_level
FROM burnout_score b
JOIN staff s      ON s.staff_id = b.staff_id
JOIN department d ON d.department_id = s.department_id
WHERE b.risk_level = 'High';

-- -----------------------------------------------------
-- One-time consistency fix: cancel shifts that fall inside leaves
-- that were already approved before the trigger existed
-- -----------------------------------------------------
UPDATE leave_request SET status = status WHERE status = 'Approved';

-- -----------------------------------------------------
-- Compute burnout scores for the last 4 weeks
-- -----------------------------------------------------
DO $$
DECLARE
    w DATE;
BEGIN
    FOR w IN SELECT generate_series(date_trunc('week', CURRENT_DATE - 21),
                                    date_trunc('week', CURRENT_DATE),
                                    INTERVAL '1 week')::DATE
    LOOP
        CALL refresh_burnout_scores(w);
    END LOOP;
END;
$$;

\echo '=== Risk level counts per week ==='
SELECT week_start, risk_level, COUNT(*) AS staff
FROM burnout_score
GROUP BY week_start, risk_level
ORDER BY week_start, risk_level;

\echo '=== VIEW high_risk_staff ==='
SELECT full_name, department, week_start, total_hours, overtime_hours, score
FROM high_risk_staff
ORDER BY week_start DESC, score DESC;
