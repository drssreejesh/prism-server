// ─── ACCEPTANCE ROUTE ─────────────────────────────────────────────────────────
// POST /api/acceptance/:lab          — save acceptance (Module 04)
// POST /api/acceptance/:lab/unlock   — admin unlocks specific lab for a visit

const router         = require('express').Router();
const db             = require('../db');
const { auth }       = require('../middleware/auth');
const { VALID_LABS } = require('../config/labs');

// ─── SAVE ACCEPTANCE ─────────────────────────────────────────────────────────
router.post('/:lab', auth('acceptance'), async (req, res) => {
  const { lab }    = req.params;
  const { cr, labid, uniqueLabId, panelStatus, notes } = req.body;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
  if (!cr || !labid) {
    return res.status(400).json({ error: 'cr and labid are required' });
  }

  // Lab role isolation: a FCM technician cannot save FISH acceptance
  if (req.role !== 'admin' && req.ownLab && req.ownLab !== lab) {
    return res.status(403).json({
      error: `Role '${req.role}' can only save acceptance for ${req.ownLab.toUpperCase()}`
    });
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
    // Check if this lab-visit is already locked
    const existing = await db.query(
      'SELECT id, locked, panel_status FROM lab_acceptance WHERE cr=$1 AND labid=$2 AND lab=$3',
      [cr, labid, lab]
    );

    if (existing.rows.length && existing.rows[0].locked && req.role !== 'admin') {
      return res.status(423).json({
        error: `${lab.toUpperCase()} acceptance for Lab ID ${labid} is locked. Contact admin to unlock.`,
        locked: true
      });
    }

    // Server-side duplicate unique_lab_id check
    // Allow re-save for the same (cr, labid, lab) — only block truly different cases
    if (uniqueLabId) {
      const dup = await db.query(
        `SELECT cr, labid FROM lab_acceptance
         WHERE lab = $1 AND unique_lab_id = $2
         AND NOT (cr = $3 AND labid = $4)`,
        [lab, uniqueLabId, cr, labid]
      );
      if (dup.rows.length) {
        return res.status(409).json({
          error: `Unique Lab ID '${uniqueLabId}' already exists for ${lab.toUpperCase()} (CR: ${dup.rows[0].cr})`
        });
      }
    }

    const oldData = existing.rows[0] || null;

    // Upsert — lock on first save
    const result = await db.query(`
      INSERT INTO lab_acceptance
        (cr, labid, lab, unique_lab_id, panel_status, notes, locked, locked_at, locked_by)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), $7)
      ON CONFLICT (cr, labid, lab) DO UPDATE SET
        unique_lab_id = EXCLUDED.unique_lab_id,
        panel_status  = EXCLUDED.panel_status,
        notes         = EXCLUDED.notes,
        locked        = TRUE,
        locked_at     = CASE WHEN lab_acceptance.locked = FALSE THEN NOW() ELSE lab_acceptance.locked_at END,
        locked_by     = CASE WHEN lab_acceptance.locked = FALSE THEN $7 ELSE lab_acceptance.locked_by END,
        updated_at    = NOW()
      RETURNING *
    `, [cr, labid, lab, uniqueLabId || null, JSON.stringify(panelStatus || {}), notes || '', req.role]);

    await db.audit({
      role: req.role, action: 'save_acceptance',
      cr, labid, lab,
      oldData: oldData ? { panelStatus: oldData.panel_status } : null,
      newData: { panelStatus, uniqueLabId, notes },
      ip: req.ip
    });

    res.json({ status: 'ok', data: result.rows[0] });

  } catch (err) {
    console.error(`POST /acceptance/${lab} error:`, err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── ADMIN UNLOCK ─────────────────────────────────────────────────────────────
// POST /api/acceptance/:lab/unlock  { cr, labid, reason }
router.post('/:lab/unlock', auth('admin'), async (req, res) => {
  const { lab }          = req.params;
  const { cr, labid, reason } = req.body;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
  if (!cr || !labid) {
    return res.status(400).json({ error: 'cr and labid are required' });
  }

  try {
    const result = await db.query(
      `UPDATE lab_acceptance SET locked = FALSE, updated_at = NOW()
       WHERE cr = $1 AND labid = $2 AND lab = $3
       RETURNING *`,
      [cr, labid, lab]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Acceptance record not found' });
    }

    // Record in unlock_log (immutable audit)
    await db.query(
      `INSERT INTO unlock_log (cr, labid, table_name, lab, reason, unlocked_by)
       VALUES ($1, $2, 'lab_acceptance', $3, $4, $5)`,
      [cr, labid, lab, reason || '', req.role]
    );

    await db.audit({
      role: req.role, action: 'unlock_acceptance',
      cr, labid, lab,
      newData: { reason },
      ip: req.ip
    });

    res.json({ status: 'ok', message: `${lab.toUpperCase()} acceptance unlocked for ${labid}` });

  } catch (err) {
    console.error(`POST /acceptance/${lab}/unlock error:`, err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
