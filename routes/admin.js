// ─── ADMIN ROUTE ──────────────────────────────────────────────────────────────
// GET /api/admin/audit/:cr         — full audit history for a CR
// GET /api/admin/unlocks           — recent unlock log
// GET /api/admin/locks/:cr/:labid  — lock status of all labs for a visit

const router   = require('express').Router();
const db       = require('../db');
const { auth } = require('../middleware/auth');

// GET /api/admin/audit/:cr
router.get('/audit/:cr', auth('admin'), async (req, res) => {
  const { cr } = req.params;
  try {
    const rows = await db.query(
      `SELECT id, role, action, labid, lab, old_data, new_data, ip, created_at
       FROM audit_log WHERE cr = $1
       ORDER BY created_at DESC LIMIT 200`,
      [cr]
    );
    res.json({ status: 'ok', cr, entries: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/admin/unlocks
router.get('/unlocks', auth('admin'), async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM unlock_log ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ status: 'ok', entries: rows.rows });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/admin/locks/:cr/:labid
// Returns lock status for all 6 labs for a specific visit
router.get('/locks/:cr/:labid', auth('admin'), async (req, res) => {
  const { cr, labid } = req.params;
  try {
    const [acceptance, results, morph] = await Promise.all([
      db.query(
        'SELECT lab, locked, locked_at, locked_by FROM lab_acceptance WHERE cr=$1 AND labid=$2',
        [cr, labid]
      ),
      db.query(
        'SELECT lab, locked, locked_at, locked_by FROM lab_results WHERE cr=$1 AND labid=$2',
        [cr, labid]
      ),
      db.query(
        'SELECT locked FROM morphology WHERE cr=$1 AND labid=$2',
        [cr, labid]
      ),
    ]);

    res.json({
      status: 'ok',
      cr, labid,
      morphology_locked: morph.rows[0]?.locked ?? false,
      acceptance: acceptance.rows,
      results:    results.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
