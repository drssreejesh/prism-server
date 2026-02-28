// ─── ORDERS ROUTE ─────────────────────────────────────────────────────────────
// POST /api/orders/:lab   — save test order for a lab (Module 03)

const router              = require('express').Router();
const db                  = require('../db');
const { auth }            = require('../middleware/auth');
const { VALID_LABS }      = require('../config/labs');

// GET /api/orders/:lab — get all orders for a lab with patient details
router.get('/:lab', auth('acceptance'), async (req, res) => {
  const { lab } = req.params;
  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
  try {
    const result = await db.query(`
      SELECT o.cr, o.labid, o.panels, o.payment, o.notes, o.created_at,
             p.name, p.age, p.sex, p.date_received as date, p.sample, p.faculty, p.jr, p.sr,
             p.tlc, p.bm_quality, p.blasts, p.eos, p.plasma,
             p.right_imprint, p.left_imprint, p.suspicion
      FROM lab_orders o
      LEFT JOIN patients p ON p.cr = o.cr AND p.labid = o.labid
      WHERE o.lab = $1
      ORDER BY o.created_at DESC
    `, [lab]);
    res.json({ status: 'ok', data: result.rows });
  } catch (err) {
    console.error('GET /orders/' + lab + ' error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/orders/:lab/accepted — get accepted cr+labid pairs
router.get('/:lab/accepted', auth('acceptance'), async (req, res) => {
  const { lab } = req.params;
  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
  try {
    const result = await db.query(
      'SELECT cr, labid FROM lab_acceptance WHERE lab = $1',
      [lab]
    );
    res.json({ status: 'ok', data: result.rows });
  } catch (err) {
    console.error('GET /orders/' + lab + '/accepted error:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/:lab', auth('orders'), async (req, res) => {
  const { lab }  = req.params;
  const { cr, labid, panels, payment, notes } = req.body;

  if (!VALID_LABS.includes(lab)) {
    return res.status(400).json({ error: `Invalid lab: ${lab}` });
  }
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
    const result = await db.query(`
      INSERT INTO lab_orders (cr, labid, lab, panels, payment, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (cr, labid, lab) DO UPDATE SET
        panels     = EXCLUDED.panels,
        payment    = EXCLUDED.payment,
        notes      = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [cr, labid, lab, panels || '', payment || '', notes || '']);

    await db.audit({
      role: req.role, action: 'save_order',
      cr, labid, lab,
      newData: { panels, payment, notes },
      ip: req.ip
    });

    res.json({ status: 'ok', data: result.rows[0] });

  } catch (err) {
    console.error(`POST /orders/${lab} error:`, err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
