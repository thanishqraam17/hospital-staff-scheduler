-- =====================================================
-- security.sql : database-level authentication and role-based access
-- Run as postgres AFTER schema.sql, seed.sql and advanced.sql.
-- Safe to re-run.
--
--   hospital_app : the login the website connects with. It can only read
--                  app_user (for login) and switch into one of the roles below.
--   app_admin    : scheduler/admin - full access to all scheduling data.
--   app_staff    : staff member - sees ONLY their own rows (Row Level Security),
--                  can request leave and manage their own check-in notes.
--
-- The website runs every query inside a transaction that does
--   SET LOCAL ROLE app_admin | app_staff
--   set_config('app.staff_id', <logged-in staff id>, true)
-- so the database itself enforces who can see and change what.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- bcrypt password hashing

-- ---------- 1. Roles ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
        CREATE ROLE app_staff NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hospital_app') THEN
        CREATE ROLE hospital_app LOGIN NOINHERIT PASSWORD 'hospital_app_pw';
    END IF;
END;
$$;

GRANT app_admin, app_staff TO hospital_app;
GRANT CONNECT ON DATABASE hospital_scheduler TO hospital_app;
GRANT USAGE ON SCHEMA public TO app_admin, app_staff, hospital_app;

-- ---------- 2. Privileges (GRANT / REVOKE) ----------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_admin, app_staff, hospital_app;

-- login only: hospital_app may read usernames/hashes, nothing else
GRANT SELECT ON app_user TO hospital_app;

-- admin: full scheduling access
GRANT SELECT, INSERT, UPDATE, DELETE ON
    department, staff, shift, shift_assignment, leave_request,
    overtime_log, burnout_score, checkin_note
TO app_admin;
GRANT SELECT ON high_risk_staff TO app_admin;

-- staff: read reference data and own data, write only leave requests and notes
GRANT SELECT ON department, shift, staff, shift_assignment,
                overtime_log, burnout_score TO app_staff;
GRANT SELECT, INSERT ON leave_request TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON checkin_note TO app_staff;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_admin, app_staff;

-- ---------- 3. Row Level Security ----------
-- current logged-in staff id, set by the website per request (NULL for admin)
CREATE OR REPLACE FUNCTION current_staff_id() RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.staff_id', true), '')::INT
$$;

ALTER TABLE staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request    ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE burnout_score    ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_note     ENABLE ROW LEVEL SECURITY;

-- admin sees and changes every row
DROP POLICY IF EXISTS admin_all ON staff;
CREATE POLICY admin_all ON staff            FOR ALL TO app_admin USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS admin_all ON shift_assignment;
CREATE POLICY admin_all ON shift_assignment FOR ALL TO app_admin USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS admin_all ON leave_request;
CREATE POLICY admin_all ON leave_request    FOR ALL TO app_admin USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS admin_all ON overtime_log;
CREATE POLICY admin_all ON overtime_log     FOR ALL TO app_admin USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS admin_all ON burnout_score;
CREATE POLICY admin_all ON burnout_score    FOR ALL TO app_admin USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS admin_all ON checkin_note;
CREATE POLICY admin_all ON checkin_note     FOR ALL TO app_admin USING (true) WITH CHECK (true);

-- staff see only their own rows
DROP POLICY IF EXISTS staff_own ON staff;
CREATE POLICY staff_own ON staff FOR SELECT TO app_staff
    USING (staff_id = current_staff_id());

DROP POLICY IF EXISTS staff_own ON shift_assignment;
CREATE POLICY staff_own ON shift_assignment FOR SELECT TO app_staff
    USING (staff_id = current_staff_id());

DROP POLICY IF EXISTS staff_own ON overtime_log;
CREATE POLICY staff_own ON overtime_log FOR SELECT TO app_staff
    USING (staff_id = current_staff_id());

DROP POLICY IF EXISTS staff_own ON burnout_score;
CREATE POLICY staff_own ON burnout_score FOR SELECT TO app_staff
    USING (staff_id = current_staff_id());

-- leave: staff read own, and may only create a PENDING request for themselves
DROP POLICY IF EXISTS staff_own_read ON leave_request;
CREATE POLICY staff_own_read ON leave_request FOR SELECT TO app_staff
    USING (staff_id = current_staff_id());
DROP POLICY IF EXISTS staff_own_insert ON leave_request;
CREATE POLICY staff_own_insert ON leave_request FOR INSERT TO app_staff
    WITH CHECK (staff_id = current_staff_id() AND status = 'Pending');

-- notes: staff fully manage their own notes only
DROP POLICY IF EXISTS staff_own ON checkin_note;
CREATE POLICY staff_own ON checkin_note FOR ALL TO app_staff
    USING (staff_id = current_staff_id())
    WITH CHECK (staff_id = current_staff_id());

-- ---------- 4. Login function (password checked inside the database) ----------
-- Returns the user only if the bcrypt hash matches; the hash never leaves the DB.
CREATE OR REPLACE FUNCTION authenticate(p_username TEXT, p_password TEXT)
RETURNS TABLE (user_id INT, username VARCHAR, role VARCHAR, staff_id INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.user_id, u.username, u.role, u.staff_id
    FROM app_user u
    WHERE u.username = lower(p_username)
      AND u.password_hash = crypt(p_password, u.password_hash)
$$;
REVOKE ALL ON FUNCTION authenticate(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authenticate(TEXT, TEXT) TO hospital_app;
REVOKE SELECT ON app_user FROM hospital_app;   -- login goes through authenticate() only

-- ---------- 5. Demo users (passwords stored as bcrypt hashes) ----------
--   admin  / admin123        (Admin)
--   <first name> / staff123  (Staff, one per staff member, e.g. ananya / staff123)
DELETE FROM app_user;
INSERT INTO app_user (username, password_hash, role, staff_id)
VALUES ('admin', crypt('admin123', gen_salt('bf')), 'Admin', NULL);

INSERT INTO app_user (username, password_hash, role, staff_id)
SELECT lower(split_part(full_name, ' ', 1)),
       crypt('staff123', gen_salt('bf')), 'Staff', staff_id
FROM staff;

\echo '=== Roles ==='
SELECT rolname, rolcanlogin, rolinherit FROM pg_roles
WHERE rolname IN ('hospital_app', 'app_admin', 'app_staff') ORDER BY rolname;

\echo '=== Row Level Security policies ==='
SELECT tablename, policyname, roles, cmd FROM pg_policies ORDER BY tablename, policyname;

\echo '=== App users (hashes, never plain passwords) ==='
SELECT user_id, username, role, staff_id, left(password_hash, 20) || '...' AS password_hash
FROM app_user ORDER BY user_id LIMIT 6;
