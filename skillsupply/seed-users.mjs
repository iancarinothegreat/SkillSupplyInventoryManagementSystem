import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';

const { Pool } = pg;

// Read .env.local manually
const env = readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) process.env[key.trim()] = val.join('=').trim();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const hash1 = await bcrypt.hash('Admin@1234', 12);
  const hash2 = await bcrypt.hash('Supply@1234', 12);
  const hash3 = await bcrypt.hash('Staff@1234', 12);

  await pool.query(`
    INSERT INTO users (role_id, username, password_hash, full_name, email) VALUES
    (3, 'admin', $1, 'System Administrator', 'admin@mmtvtc.gov.ph'),
    (2, 'supplyofficer', $2, 'Supply Officer', 'supply@mmtvtc.gov.ph'),
    (1, 'divstaff1', $3, 'Division Staff 1', 'staff1@mmtvtc.gov.ph')
    ON CONFLICT (username) DO NOTHING
  `, [hash1, hash2, hash3]);

  console.log('✓ Users created successfully');
  console.log('  admin / Admin@1234');
  console.log('  supplyofficer / Supply@1234');
  console.log('  divstaff1 / Staff@1234');
  await pool.end();
}

seed().catch(console.error);