// ─── PATIENTS ROUTE ───────────────────────────────────────────────────────────
// GET  /api/patients/:cr        — fetch all data for a CR (all visits)
// POST /api/patients            — register a new visit (Module 01)

const router  = require('express').Router();
const db      = require('../db');
const { auth } = require('../middleware/auth');

// ─── VALIDATION ───────────────────────────────────────────────────────────────
function validateRegistration(body) {
  const errors = [];
  const { cr, labid, date, name, age, sex, faculty, sample } = body;

  if (!cr)              errors.push('CR number is required');
  else if (!/^\d{12}$/.test(cr)) errors.push('CR number must be exactly 12 digits');

  if (!labid)           errors.push('Lab ID is required');
  else if (!/^[AP]_\d+_\d{4}$/.test(labid)) errors.push('Lab ID format invalid (expected A_100_2026 or P_100_2026)');

  if (!date)            errors.push('Date received is required');
  if (!name || !name.trim()) errors.push('Patient name is required');
  if (age === undefined || age === null || age === '') errors.push('Age is required');
  if (!sex)             errors.push('Sex is required');
  if (!faculty)         errors.push('Faculty is required');
  if (!sample)          errors.push('Sample type is required');

  return errors;
}

// ─── GET /api/patients/:cr ────────────────────────────────────────────────────
// Replaces fetchAllFromSheet(). Returns all visits + all associated data.
// Frontend caches into localStorage exactly as before.
router.get('/:cr', auth('patients'), async (req, res) => {
  const { cr } = req.params;

  if (!/^\d{12}$/.test(cr)) {
    return res.status(400).json({ error: 'CR number must be exactly 12 digits' });
  }

  try {
    // Fire all queries in parallel — much faster than sequential
    const [patients, morphs, orders, acceptance, results] = await Promise.all([
      db.query(
        'SELECT * FROM patients WHERE cr = $1 ORDER BY date_received ASC, created_at ASC',
        [cr]
      ),
      db.query(
        'SELECT * FROM morphology WHERE cr = $1',
        [cr]
      ),
      db.query(
        'SELECT * FROM lab_orders WHERE cr = $1',
        [cr]
      ),
      db.query(
        'SELECT * FROM lab_acceptance WHERE cr = $1',
        [cr]
      ),
      db.query(
        'SELECT * FROM lab_results WHERE cr = $1',
        [cr]
      ),
    ]);

    if (!patients.rows.length) {
      return res.status(404).json({ error: 'CR not found', cr });
    }

    // Compute active_labid: latest visit by date_received
    const sortedVisits = patients.rows;
    const activeLabId  = sortedVisits[sortedVisits.length - 1].labid;

    res.json({
      status:        'ok',
      active_labid:  activeLabId,   // frontend uses this as default selection
      data: {
        patients:   patients.rows,
        morphs:     morphs.rows,
        orders:     orders.rows,
        acceptance: acceptance.rows,
        results:    results.rows,
      }
    });

  } catch (err) {
    console.error('GET /patients/:cr error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── POST /api/patients ───────────────────────────────────────────────────────
// Module 01 — Patient Registration.
// Uses ON CONFLICT DO UPDATE so re-submitting the same visit updates it (if not locked).
router.post('/', auth('patients'), async (req, res) => {
  const {
    cr, labid, date, name, age, sex,
    faculty, jr, sr, sample, tlc,
    bmQuality, blasts, eos, plasma,
    rightImprint, leftImprint, suspicion
  } = req.body;

  // Validate
  const errors = validateRegistration(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors[0], all_errors: errors });
  }

  try {
    // Soft-block check: does this CR already have visits with different lab IDs?
    const existing = await db.query(
      'SELECT labid FROM patients WHERE cr = $1 ORDER BY date_received ASC',
      [cr]
    );
    const existingLabIds = existing.rows.map(r => r.labid);
    const isNewVisit     = existingLabIds.length > 0 && !existingLabIds.includes(labid);

    // Get old data for audit (if updating)
    let oldData = null;
    if (existingLabIds.includes(labid)) {
      const old = await db.query(
        'SELECT * FROM patients WHERE cr = $1 AND labid = $2',
        [cr, labid]
      );
      oldData = old.rows[0] || null;
    }

    // Upsert — safe for concurrent writes (PostgreSQL serializes ON CONFLICT)
    const result = await db.query(`
      INSERT INTO patients
        (cr, labid, date_received, name, age, sex, faculty, jr, sr,
         sample, tlc, bm_quality, blasts, eos, plasma,
         right_imprint, left_imprint, suspicion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (cr, labid) DO UPDATE SET
        date_received = EXCLUDED.date_received,
        name          = EXCLUDED.name,
        age           = EXCLUDED.age,
        sex           = EXCLUDED.sex,
        faculty       = EXCLUDED.faculty,
        jr            = EXCLUDED.jr,
        sr            = EXCLUDED.sr,
        sample        = EXCLUDED.sample,
        tlc           = EXCLUDED.tlc,
        bm_quality    = EXCLUDED.bm_quality,
        blasts        = EXCLUDED.blasts,
        eos           = EXCLUDED.eos,
        plasma        = EXCLUDED.plasma,
        right_imprint = EXCLUDED.right_imprint,
        left_imprint  = EXCLUDED.left_imprint,
        suspicion     = EXCLUDED.suspicion,
        updated_at    = NOW()
      RETURNING *
    `, [
      cr, labid, date, name.trim(), age || null, sex,
      faculty, jr || null, sr || null, sample,
      tlc || null, bmQuality || null,
      blasts !== '' ? blasts : null,
      eos    !== '' ? eos    : null,
      plasma !== '' ? plasma : null,
      rightImprint || null, leftImprint || null, suspicion || null
    ]);

    const saved = result.rows[0];

    // Audit log
    await db.audit({
      role:    req.role,
      action:  oldData ? 'update_registration' : 'register',
      cr, labid,
      oldData,
      newData: saved,
      ip:      req.ip
    });

    res.json({
      status:        'ok',
      data:          saved,
      is_new_visit:  isNewVisit,
      existing_labids: existingLabIds.filter(id => id !== labid)
    });

  } catch (err) {
    console.error('POST /patients error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
