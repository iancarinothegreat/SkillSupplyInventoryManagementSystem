UPDATE users
SET email = CONCAT(username, '@noemail.local')
WHERE email IS NULL;

ALTER TABLE users
  ALTER COLUMN email SET NOT NULL;
