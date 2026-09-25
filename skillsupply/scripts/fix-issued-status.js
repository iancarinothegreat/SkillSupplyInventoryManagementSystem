const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const r1 = await pool.query("UPDATE borrow_transactions SET status = 'Borrowed' WHERE status = 'Issued'");
  console.log('borrow_transactions fixed:', r1.rowCount, 'rows');
  const r2 = await pool.query("UPDATE requisitions SET status = 'Approved' WHERE status = 'Issued'");
  console.log('requisitions fixed:', r2.rowCount, 'rows');
  await pool.end();
  process.exit(0);
})().catch(e => { console.error(e); pool.end(); process.exit(1); });
