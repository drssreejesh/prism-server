// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

const ROLE_ACCESS = {
  resident:   ['patients', 'morph', 'orders'],
  fish:       ['patients', 'morph', 'acceptance', 'results', 'read'],
  fcm:        ['patients', 'morph', 'acceptance', 'results', 'read'],
  rtpcr:      ['patients', 'morph', 'acceptance', 'results', 'read'],
  ngsh12:     ['patients', 'morph', 'acceptance', 'results', 'read'],
  ngsh9:      ['patients', 'morph', 'acceptance', 'results', 'read'],
  tcr:        ['patients', 'morph', 'acceptance', 'results', 'read'],
  consultant: ['patients', 'morph', 'orders', 'acceptance', 'results', 'read'],
  admin:      ['patients', 'morph', 'orders', 'acceptance', 'results', 'read', 'admin'],
};

const ROLE_LAB = {
  fish: 'fish', fcm: 'fcm', rtpcr: 'rtpcr',
  ngsh12: 'ngsh12', ngsh9: 'ngsh9', tcr: 'tcr'
};

function auth(resource) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        error: e.name === 'TokenExpiredError' ? 'Token expired — please log in again' : 'Invalid token'
      });
    }
    req.role   = decoded.role;
    req.ownLab = ROLE_LAB[decoded.role] || null;
    if (resource) {
      const required  = Array.isArray(resource) ? resource : [resource];
      const permitted = ROLE_ACCESS[decoded.role] || [];
      const allowed   = required.some(r => permitted.includes(r));
      if (!allowed) {
        return res.status(403).json({
          error: `Role '${decoded.role}' does not have permission for this action`
        });
      }
    }
    next();
  };
}

module.exports = { auth, ROLE_ACCESS, ROLE_LAB };
