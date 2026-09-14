ALTER TABLE users ADD COLUMN IF NOT EXISTS division_id INT REFERENCES divisions(division_id);
