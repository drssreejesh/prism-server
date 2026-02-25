// ─── DATABASE POOL ────────────────────────────────────────────────────────────
// Single pg Pool shared across all routes.
// Railway sets DATABASE_URL automatically when Postgres plugin is attached.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,                  // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err.message);
});

// ─── QUERY WRAPPER ────────────────────────────────────────────────────────────
// Use this everywhere instead of pool.query directly.
// Logs slow queries (>500ms) for debugging.

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`Slow query (${duration}ms):`, text.slice(0, 80));
    }
    return res;
  } catch (err) {
    console.error('DB query error:', err.message, '\nQuery:', text.slice(0, 120));
    throw err;
  }
}

// ─── AUDIT HELPER ─────────────────────────────────────────────────────────────
// Call this from every route that writes data.
async function audit({ role, action, cr, labid, lab, oldData, newData, ip }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (role, action, cr, labid, lab, old_data, new_data, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        role || 'unknown',
        action,
        cr   || null,
        labid || null,
        lab  || null,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        ip   || null,
      ]
    );
  } catch (err) {
    // Audit failure must never crash the main request
    console.error('Audit log error:', err.message);
  }
}

module.exports = { query, audit, pool };
