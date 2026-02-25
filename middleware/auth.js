// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
// Usage in routes:
//   router.get('/path', auth('patients'), handler)
//   router.post('/path', auth(['acceptance','admin']), handler)
//   router.post('/path', auth(), handler)  // any valid token

const jwt = require('jsonwebtoken');

// What each role is allowed to access
const ROLE_ACCESS = {
  resident:   ['patients', 'morph', 'orders'],
  fish:       ['acceptance', 'results'],
  fcm:        ['acceptance', 'results'],
  rtpcr:      ['acceptance', 'results'],
  ngsh12:     ['acceptance', 'results'],
  ngsh9:      ['acceptance', 'results'],
  tcr:        ['acceptance', 'results'],
  consultant: ['read'],
  admin:      ['patients', 'morph', 'orders', 'acceptance', 'results', 'read', 'admin'],
};

// Which lab each lab role owns
const ROLE_LAB = {
  fish: 'fish', fcm: 'fcm', rtpcr: 'rtpcr',
  ngsh12: 'ngsh12', ngsh9: 'ngsh9', tcr: 'tcr'
};

/**
 * auth(resource?)
 * @param {string|string[]|undefined} resource - required permission(s)
 * Returns middleware that:
 *   1. Verifies JWT
 *   2. Checks role has the required resource permission
 *   3. Attaches req.role and req.ownLab to the request
 */
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

    // Attach role info to request
    req.role   = decoded.role;
    req.ownLab = ROLE_LAB[decoded.role] || null;

    // Check resource permission if specified
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
