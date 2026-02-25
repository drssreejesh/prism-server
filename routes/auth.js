// ─── AUTH ROUTE ───────────────────────────────────────────────────────────────
// POST /api/auth/login  { role, password } → { token, role, expiresIn }

const router = require('express').Router();
const jwt    = require('jsonwebtoken');

// Role passwords loaded from environment variables — never from source code
function getRolePasswords() {
  return {
    resident:   process.env.PWD_RESIDENT,
    fish:       process.env.PWD_FISH,
    fcm:        process.env.PWD_FCM,
    rtpcr:      process.env.PWD_RTPCR,
    ngsh12:     process.env.PWD_NGSH12,
    ngsh9:      process.env.PWD_NGSH9,
    tcr:        process.env.PWD_TCR,
    consultant: process.env.PWD_CONSULTANT,
    admin:      process.env.PWD_ADMIN,
  };
}

const VALID_ROLES = [
  'resident', 'fish', 'fcm', 'rtpcr',
  'ngsh12', 'ngsh9', 'tcr', 'consultant', 'admin'
];

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { role, password } = req.body;

  if (!role || !password) {
    return res.status(400).json({ error: 'role and password are required' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const passwords = getRolePasswords();
  const expected  = passwords[role];

  if (!expected) {
    console.error(`Password not configured for role: ${role}`);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (password !== expected) {
    // Generic message — don't reveal whether role exists or password is wrong
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = jwt.sign(
    { role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    status: 'ok',
    token,
    role,
    expiresIn: '12h'
  });
});

module.exports = router;
