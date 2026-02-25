// ─── SEARCH ROUTE ─────────────────────────────────────────────────────────────
// GET /api/search?q=<query>
// Searches across: CR number, Lab ID, patient name
// Returns latest visit per matching CR for display

const router   = require('express').Router();
const db       = require('../db');
const { auth } = require('../middleware/auth');

router.get('/', auth(), async (req, res) => {
  const q = (req.query.q || '').trim();

  if (q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  try {
    // Search across cr, labid, name — case-insensitive
    // Returns distinct CRs with their latest visit data
    const rows = await db.query(`
      SELECT DISTINCT ON (p.cr)
        p.cr,
        p.labid,
        p.name,
        p.date_received,
        p.faculty,
        p.suspicion,
        p.age,
        p.sex
      FROM patients p
      WHERE
        p.cr    ILIKE $1 OR
        p.labid ILIKE $1 OR
        p.name  ILIKE $1
      ORDER BY p.cr, p.date_received DESC
      LIMIT 20
    `, [`%${q}%`]);

    res.json({ status: 'ok', count: rows.rows.length, results: rows.rows });

  } catch (err) {
    console.error('GET /search error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
