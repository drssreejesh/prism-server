// ─── MORPHOLOGY ROUTE ─────────────────────────────────────────────────────────
// POST /api/morph   — save BM morphology report (Module 02)

const router   = require('express').Router();
const db       = require('../db');
const { auth } = require('../middleware/auth');

router.post('/', auth('morph'), async (req, res) => {
  const { cr, labid, report } = req.body;

  if (!cr || !labid) {
    return res.status(400).json({ error: 'cr and labid are required' });
  }

  // Verify patient exists
  const patient = await db.query(
    'SELECT id FROM patients WHERE cr = $1 AND labid = $2',
    [cr, labid]
  );
  if (!patient.rows.length) {
    return res.status(404).json({ error: 'Patient visit not found. Complete Module 01 first.' });
  }

  try {
    // Check if locked (admin-only override required)
    const existing = await db.query(
      'SELECT locked FROM morphology WHERE cr = $1 AND labid = $2',
      [cr, labid]
    );

    if (existing.rows.length && existing.rows[0].locked && req.role !== 'admin') {
      return res.status(423).json({
        error: 'Morphology for this visit is locked. Contact admin to unlock.',
        locked: true
      });
    }

    const result = await db.query(`
      INSERT INTO morphology (cr, labid, report, locked)
      VALUES ($1, $2, $3, FALSE)
      ON CONFLICT (cr, labid) DO UPDATE SET
        report     = EXCLUDED.report,
        updated_at = NOW()
      RETURNING *
    `, [cr, labid, report || '']);

    await db.audit({
      role: req.role, action: 'save_morph',
      cr, labid,
      newData: { report },
      ip: req.ip
    });

    res.json({ status: 'ok', data: result.rows[0] });

  } catch (err) {
    console.error('POST /morph error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
