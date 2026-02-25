// ═══════════════════════════════════════════════════════════════════════════
// PRISM API Server
// PGIMER HemePath Registry — Node.js + Express + PostgreSQL
// Deploy: Railway (railway.app)
// ═══════════════════════════════════════════════════════════════════════════

require('dotenv').config();   // loads .env in local dev; Railway uses env vars directly

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app = express();

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────────────────────
// Only accept requests from the GitHub Pages frontend
const allowedOrigins = [
  process.env.ALLOWED_ORIGIN || 'https://drssreejesh.github.io',
  // Allow localhost during development
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, Railway health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
// 300 requests per 15 minutes per IP — generous for a lab setting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a moment' }
}));

// ─── BODY PARSING ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── REQUEST LOGGER (minimal) ────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path !== '/api/ping') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/patients',   require('./routes/patients'));
app.use('/api/morph',      require('./routes/morphology'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/acceptance', require('./routes/acceptance'));
app.use('/api/results',    require('./routes/results'));
app.use('/api/search',     require('./routes/search'));
app.use('/api/admin',      require('./routes/admin'));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
// Railway uses this to verify the service is up
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', service: 'PRISM API', ts: new Date().toISOString() });
});

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PRISM API running on port ${PORT}`);
  console.log(`Allowed origin: ${process.env.ALLOWED_ORIGIN}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
