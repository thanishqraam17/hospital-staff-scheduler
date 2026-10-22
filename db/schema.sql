CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE department (
    department_id        SERIAL PRIMARY KEY,
    name                 VARCHAR(100) NOT NULL UNIQUE,
    min_staff_per_shift  INT NOT NULL DEFAULT 1 CHECK (min_staff_per_shift > 0)
);

CREATE TABLE staff (
    staff_id          SERIAL PRIMARY KEY,
    full_name         VARCHAR(120) NOT NULL,
    role_title        VARCHAR(20) NOT NULL
                      CHECK (role_title IN ('Doctor','Nurse','Technician')),
    email             VARCHAR(150) NOT NULL UNIQUE,
    hire_date         DATE NOT NULL CHECK (hire_date <= CURRENT_DATE),
    max_weekly_hours  INT NOT NULL DEFAULT 48 CHECK (max_weekly_hours > 0),
    department_id     INT NOT NULL REFERENCES department(department_id)
);

CREATE TABLE shift (
    shift_id        SERIAL PRIMARY KEY,
    department_id   INT NOT NULL REFERENCES department(department_id),
    shift_date      DATE NOT NULL,
    shift_type      VARCHAR(10) NOT NULL
                    CHECK (shift_type IN ('Morning','Evening','Night')),
    start_time      TIMESTAMP NOT NULL,
    end_time        TIMESTAMP NOT NULL,
    required_staff  INT NOT NULL DEFAULT 1 CHECK (required_staff > 0),
    CHECK (end_time > start_time),
    UNIQUE (department_id, shift_date, shift_type)
);

CREATE TABLE shift_assignment (
    assignment_id  SERIAL PRIMARY KEY,
    shift_id       INT NOT NULL REFERENCES shift(shift_id) ON DELETE CASCADE,
    staff_id       INT NOT NULL REFERENCES staff(staff_id) ON DELETE CASCADE,
    status         VARCHAR(10) NOT NULL DEFAULT 'Assigned'
                   CHECK (status IN ('Assigned','Swapped','Cancelled')),
    UNIQUE (shift_id, staff_id)
);

CREATE TABLE leave_request (
    leave_id    SERIAL PRIMARY KEY,
    staff_id    INT NOT NULL REFERENCES staff(staff_id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    reason      VARCHAR(255),
    status      VARCHAR(10) NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending','Approved','Rejected')),
    CHECK (end_date >= start_date)
);

CREATE TABLE overtime_log (
    overtime_id  SERIAL PRIMARY KEY,
    staff_id     INT NOT NULL REFERENCES staff(staff_id) ON DELETE CASCADE,
    shift_id     INT NOT NULL REFERENCES shift(shift_id) ON DELETE CASCADE,
    hours        NUMERIC(4,1) NOT NULL CHECK (hours > 0 AND hours <= 12),
    logged_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE burnout_score (
    score_id              SERIAL PRIMARY KEY,
    staff_id              INT NOT NULL REFERENCES staff(staff_id) ON DELETE CASCADE,
    week_start            DATE NOT NULL,
    total_hours           NUMERIC(5,1) NOT NULL DEFAULT 0,
    night_shifts          INT NOT NULL DEFAULT 0,
    max_consecutive_days  INT NOT NULL DEFAULT 0,
    overtime_hours        NUMERIC(5,1) NOT NULL DEFAULT 0,
    score                 INT NOT NULL CHECK (score BETWEEN 0 AND 100),
    risk_level            VARCHAR(6) NOT NULL
                          CHECK (risk_level IN ('Low','Medium','High')),
    UNIQUE (staff_id, week_start)
);

CREATE TABLE checkin_note (
    note_id      SERIAL PRIMARY KEY,
    staff_id     INT NOT NULL REFERENCES staff(staff_id) ON DELETE CASCADE,
    note_text    TEXT NOT NULL CHECK (length(trim(note_text)) > 0),
    mood_rating  INT NOT NULL CHECK (mood_rating BETWEEN 1 AND 5),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    embedding    vector(384)
);

CREATE TABLE app_user (
    user_id        SERIAL PRIMARY KEY,
    username       VARCHAR(50) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(10) NOT NULL CHECK (role IN ('Admin','Staff')),
    staff_id       INT UNIQUE REFERENCES staff(staff_id) ON DELETE CASCADE,
    CHECK ((role = 'Staff' AND staff_id IS NOT NULL) OR role = 'Admin')
);

-- Indexes
CREATE INDEX idx_shift_date ON shift(shift_date);
CREATE INDEX idx_assignment_staff ON shift_assignment(staff_id);
CREATE INDEX idx_overtime_staff ON overtime_log(staff_id);
CREATE INDEX idx_note_embedding ON checkin_note
    USING hnsw (embedding vector_cosine_ops);