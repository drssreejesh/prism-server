-- ═══════════════════════════════════════════════════════════════════════════
-- PRISM — PostgreSQL Schema
-- PGIMER HemePath Registry
-- Run this once in your Railway Postgres console
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PATIENTS ────────────────────────────────────────────────────────────────
-- One row per visit (CR + LabID pair).
-- A patient can have multiple rows (multiple visits) with same CR, different labid.
CREATE TABLE IF NOT EXISTS patients (
  id            SERIAL PRIMARY KEY,
  cr            VARCHAR(12)   NOT NULL,
  labid         VARCHAR(30)   NOT NULL,
  date_received DATE          NOT NULL,
  name          VARCHAR(200)  NOT NULL,
  age           INTEGER,
  sex           VARCHAR(10),
  faculty       VARCHAR(50),
  jr            VARCHAR(100),
  sr            VARCHAR(100),
  sample        VARCHAR(5),            -- 'PB' or 'BM'
  tlc           NUMERIC(8,2),
  bm_quality    TEXT,                  -- comma-separated tag values
  blasts        NUMERIC(5,2),
  eos           NUMERIC(5,2),
  plasma        NUMERIC(5,2),
  right_imprint TEXT,
  left_imprint  TEXT,
  suspicion     TEXT,                  -- comma-separated tag values
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_visit UNIQUE (cr, labid)
);

CREATE INDEX IF NOT EXISTS idx_patients_cr     ON patients(cr);
CREATE INDEX IF NOT EXISTS idx_patients_name   ON patients(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_patients_labid  ON patients(labid);

-- ─── BM MORPHOLOGY ───────────────────────────────────────────────────────────
-- One row per visit. Locked = true once resident saves.
-- Admin can unlock (set locked = false) to allow correction.
CREATE TABLE IF NOT EXISTS morphology (
  id         SERIAL PRIMARY KEY,
  cr         VARCHAR(12)  NOT NULL,
  labid      VARCHAR(30)  NOT NULL,
  report     TEXT,
  locked     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_morph_visit UNIQUE (cr, labid),
  CONSTRAINT fk_morph_patient FOREIGN KEY (cr, labid)
    REFERENCES patients(cr, labid) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ─── LAB ORDERS ──────────────────────────────────────────────────────────────
-- One row per lab per visit.
-- e.g. (cr=202600012345, labid=A_100_2026, lab=fish)
CREATE TABLE IF NOT EXISTS lab_orders (
  id         SERIAL PRIMARY KEY,
  cr         VARCHAR(12)  NOT NULL,
  labid      VARCHAR(30)  NOT NULL,
  lab        VARCHAR(10)  NOT NULL,  -- 'fish','fcm','rtpcr','ngsh12','ngsh9','tcr'
  panels     TEXT,                   -- pipe-separated: 'ALL | MDS | CLL'
  payment    VARCHAR(30),            -- '✅ Paid', 'Ayushman', 'Poor Free', etc.
  notes      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_order_visit_lab UNIQUE (cr, labid, lab),
  CONSTRAINT fk_order_patient FOREIGN KEY (cr, labid)
    REFERENCES patients(cr, labid) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_lab CHECK (lab IN ('fish','fcm','rtpcr','ngsh12','ngsh9','tcr'))
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_cr ON lab_orders(cr);

-- ─── TEST ACCEPTANCE ─────────────────────────────────────────────────────────
-- One row per lab per visit.
-- locked = true after first save. Admin can set locked = false for specific lab.
CREATE TABLE IF NOT EXISTS lab_acceptance (
  id            SERIAL PRIMARY KEY,
  cr            VARCHAR(12)  NOT NULL,
  labid         VARCHAR(30)  NOT NULL,
  lab           VARCHAR(10)  NOT NULL,
  unique_lab_id VARCHAR(60),                  -- e.g. 'FCM-2026-001'
  panel_status  JSONB        NOT NULL DEFAULT '{}', -- {"Acute Leuk":"OK","CLPD":"PP"}
  notes         TEXT,
  locked        BOOLEAN      NOT NULL DEFAULT FALSE,
  locked_at     TIMESTAMPTZ,
  locked_by     VARCHAR(20),                  -- role that triggered lock
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_accept_visit_lab    UNIQUE (cr, labid, lab),
  CONSTRAINT uq_accept_unique_labid UNIQUE (lab, unique_lab_id),  -- no duplicate IDs per lab
  CONSTRAINT fk_accept_patient FOREIGN KEY (cr, labid)
    REFERENCES patients(cr, labid) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_accept_lab CHECK (lab IN ('fish','fcm','rtpcr','ngsh12','ngsh9','tcr'))
);

CREATE INDEX IF NOT EXISTS idx_lab_acceptance_cr ON lab_acceptance(cr);

-- ─── RESULT ENTRY ────────────────────────────────────────────────────────────
-- One row per lab per visit.
-- locked = true after first result save.
CREATE TABLE IF NOT EXISTS lab_results (
  id            SERIAL PRIMARY KEY,
  cr            VARCHAR(12)  NOT NULL,
  labid         VARCHAR(30)  NOT NULL,
  lab           VARCHAR(10)  NOT NULL,
  panel_results JSONB        NOT NULL DEFAULT '{}', -- {"ALL":"Positive","MDS":"Negative"}
  locked        BOOLEAN      NOT NULL DEFAULT FALSE,
  locked_at     TIMESTAMPTZ,
  locked_by     VARCHAR(20),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_result_visit_lab UNIQUE (cr, labid, lab),
  CONSTRAINT fk_result_patient FOREIGN KEY (cr, labid)
    REFERENCES patients(cr, labid) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_result_lab CHECK (lab IN ('fish','fcm','rtpcr','ngsh12','ngsh9','tcr'))
);

CREATE INDEX IF NOT EXISTS idx_lab_results_cr ON lab_results(cr);

-- ─── ADMIN UNLOCK LOG ────────────────────────────────────────────────────────
-- Every unlock is recorded. Cannot be deleted.
CREATE TABLE IF NOT EXISTS unlock_log (
  id         SERIAL PRIMARY KEY,
  cr         VARCHAR(12)  NOT NULL,
  labid      VARCHAR(30)  NOT NULL,
  table_name VARCHAR(20)  NOT NULL,  -- 'lab_acceptance', 'lab_results', 'morphology'
  lab        VARCHAR(10),            -- null for morphology
  reason     TEXT,
  unlocked_by VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────
-- Immutable. Every write action is recorded with before/after snapshot.
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  role       VARCHAR(20)  NOT NULL,
  action     VARCHAR(50)  NOT NULL,  -- 'register','save_morph','save_order',etc.
  cr         VARCHAR(12),
  labid      VARCHAR(30),
  lab        VARCHAR(10),
  old_data   JSONB,                  -- snapshot before change
  new_data   JSONB,                  -- snapshot after change
  ip         VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_cr ON audit_log(cr);

-- ─── HELPER FUNCTION: auto-update updated_at ─────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patients_updated
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_morphology_updated
  BEFORE UPDATE ON morphology
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_lab_orders_updated
  BEFORE UPDATE ON lab_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_lab_acceptance_updated
  BEFORE UPDATE ON lab_acceptance
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_lab_results_updated
  BEFORE UPDATE ON lab_results
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
