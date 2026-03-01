// ─── RESULTS ROUTE ────────────────────────────────────────────────────────────
// GET /api/results/:lab            — get all cases for admin export (by order date)
// POST /api/results/:lab          — save lab results (Module 05)
// POST /api/results/:lab/unlock   — admin unlocks specific lab results

const router         = require('express').Router();
const db             = require('../db');
const { auth }       = require('../middleware/auth');
const { VALID_LABS } = require('../config/labs');

// ─── GET ALL CASES FOR ADMIN EXPORT ──────────────────────────────────────────
router.get('/:lab', auth('admin'), async (req, res) => {
  const { lab } = req.params;
  const { from, to } = req.query;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to date params required' });
  }

  try {
    const result = await db.query(`
      SELECT 
        o.cr, o.labid, o.panels, o.created_at as order_date,
        p.name, p.age, p.sex, p.date_received as date, p.suspicion,
        p.faculty, p.jr, p.sr, p.sample, p.tlc, p.bm_quality,
        p.blasts, p.eos, p.plasma, p.right_imprint, p.left_imprint,
        a.unique_lab_id, a.panel_status, a.notes as acceptance_notes,
        r.panel_results, r.locked
      FROM lab_orders o
      LEFT JOIN patients p ON p.cr = o.cr AND p.labid = o.labid
      LEFT JOIN lab_acceptance a ON a.cr = o.cr AND a.labid = o.labid AND a.lab = o.lab
      LEFT JOIN lab_results r ON r.cr = o.cr AND r.labid = o.labid AND r.lab = o.lab
      WHERE o.lab = $1
        AND o.created_at >= $2::date
        AND o.created_at < ($3::date + INTERVAL '1 day')
      ORDER BY o.created_at DESC
    `, [lab, from, to]);
    res.json({ status: 'ok', data: result.rows });
  } catch (err) {
    console.error('GET /results/' + lab + ' error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── SAVE RESULTS ────────────────────────────────────────────────────────────
router.post('/:lab', auth('results'), async (req, res) => {
  const { lab }          = req.params;
  const { cr, labid, panelResults } = req.body;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
  if (!cr || !labid) {
    return res.status(400).json({ error: 'cr and labid are required' });
  }

  // Lab role isolation
  if (req.role !== 'admin' && req.ownLab && req.ownLab !== lab) {
    return res.status(403).json({
      error: `Role '${req.role}' can only save results for ${req.ownLab.toUpperCase()}`
    });
  }

  // Verify acceptance exists (workflow gate: must accept before entering results)
  const acceptance = await db.query(
    'SELECT id FROM lab_acceptance WHERE cr=$1 AND labid=$2 AND lab=$3',
    [cr, labid, lab]
  );
  if (!acceptance.rows.length) {
    return res.status(422).json({
      error: `No ${lab.toUpperCase()} acceptance found for Lab ID ${labid}. Complete Module 04 first.`
    });
  }

  try {
    // Check if locked
    const existing = await db.query(
      'SELECT id, locked, panel_results FROM lab_results WHERE cr=$1 AND labid=$2 AND lab=$3',
      [cr, labid, lab]
    );

    if (existing.rows.length && existing.rows[0].locked && req.role !== 'admin') {
      return res.status(423).json({
        error: `${lab.toUpperCase()} results for Lab ID ${labid} are locked. Contact admin to unlock.`,
        locked: true
      });
    }

    const oldData = existing.rows[0] || null;

    const result = await db.query(`
      INSERT INTO lab_results
        (cr, labid, lab, panel_results, locked, locked_at, locked_by)
      VALUES ($1, $2, $3, $4, TRUE, NOW(), $5)
      ON CONFLICT (cr, labid, lab) DO UPDATE SET
        panel_results = EXCLUDED.panel_results,
        locked        = TRUE,
        locked_at     = CASE WHEN lab_results.locked = FALSE THEN NOW() ELSE lab_results.locked_at END,
        locked_by     = CASE WHEN lab_results.locked = FALSE THEN $5 ELSE lab_results.locked_by END,
        updated_at    = NOW()
      RETURNING *
    `, [cr, labid, lab, JSON.stringify(panelResults || {}), req.role]);

    await db.audit({
      role: req.role, action: 'save_results',
      cr, labid, lab,
      oldData: oldData ? { panelResults: oldData.panel_results } : null,
      newData: { panelResults },
      ip: req.ip
    });

    res.json({ status: 'ok', data: result.rows[0] });

  } catch (err) {
    console.error(`POST /results/${lab} error:`, err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── ADMIN UNLOCK ─────────────────────────────────────────────────────────────
router.post('/:lab/unlock', auth('admin'), async (req, res) => {
  const { lab }               = req.params;
  const { cr, labid, reason } = req.body;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }

  try {
    const result = await db.query(
      `UPDATE lab_results SET locked = FALSE, updated_at = NOW()
       WHERE cr = $1 AND labid = $2 AND lab = $3
       RETURNING *`,
      [cr, labid, lab]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Results record not found' });
    }

    await db.query(
      `INSERT INTO unlock_log (cr, labid, table_name, lab, reason, unlocked_by)
       VALUES ($1, $2, 'lab_results', $3, $4, $5)`,
      [cr, labid, lab, reason || '', req.role]
    );

    await db.audit({
      role: req.role, action: 'unlock_results',
      cr, labid, lab, newData: { reason }, ip: req.ip
    });

    res.json({ status: 'ok', message: `${lab.toUpperCase()} results unlocked for ${labid}` });

  } catch (err) {
    console.error(`POST /results/${lab}/unlock error:`, err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
