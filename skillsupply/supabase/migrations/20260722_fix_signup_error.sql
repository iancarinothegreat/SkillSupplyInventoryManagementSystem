DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'division_id'
  ) THEN
    ALTER TABLE users ALTER COLUMN division_id DROP NOT NULL;
  END IF;
END $$;
