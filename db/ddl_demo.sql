-- ALTER: add a column, then a constraint
ALTER TABLE staff ADD COLUMN phone VARCHAR(15);
ALTER TABLE staff ADD CONSTRAINT chk_phone_len CHECK (phone IS NULL OR length(phone) >= 10);

-- DROP: remove a column, an index, and a demo table
ALTER TABLE staff DROP COLUMN phone;
CREATE TABLE temp_demo (id INT);
DROP TABLE temp_demo;
DROP INDEX idx_overtime_staff;
CREATE INDEX idx_overtime_staff ON overtime_log(staff_id);