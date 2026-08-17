import pg from 'pg';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf-8');
env.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) process.env[key.trim()] = val.join('=').trim();
});

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const reqs = await pool.query(`
    SELECT r.requisition_id, r.user_id, r.division_id, r.status, r.requested_date, r.created_at,
           u.username, u.role_id, d.division_name
    FROM requisitions r
    JOIN users u ON r.user_id = u.user_id
    LEFT JOIN divisions d ON r.division_id = d.division_id
    ORDER BY r.created_at DESC
  `);
  console.log('Requisitions:', JSON.stringify(reqs.rows, null, 2));

  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'requisitions' ORDER BY ordinal_position");
  console.log('Columns:', JSON.stringify(cols.rows, null, 2));

  await pool.end();
}

main().catch(console.error);
