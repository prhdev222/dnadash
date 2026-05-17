-- DNA Dashboard schema only
-- Safe to commit: no patient data

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_no INTEGER NOT NULL UNIQUE,
  apoe_genotype TEXT DEFAULT 'ε3/ε3',
  genetic_diseases TEXT,
  wgs_heart TEXT,
  wgs_other TEXT,
  ncd_summary TEXT,
  exercise_plan TEXT,
  diet_plan TEXT,
  monitoring_plan TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patient_portal_profile (
  participant_no INTEGER PRIMARY KEY,
  display_name TEXT,
  portal_note TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS health_risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_no INTEGER NOT NULL,
  rank_order INTEGER NOT NULL,
  disease_name TEXT NOT NULL,
  multiplier REAL NOT NULL,
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wgs_cancer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_no INTEGER NOT NULL,
  cancer_type TEXT NOT NULL,
  carrier_status TEXT,
  multiplier REAL,
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nutrition_needs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_no INTEGER NOT NULL,
  nutrient TEXT NOT NULL,
  need_level TEXT NOT NULL,
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pgx_drugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_no INTEGER NOT NULL,
  drug_name TEXT NOT NULL,
  risk_type TEXT NOT NULL,
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pgx_drug_catalog (
  drug_name TEXT PRIMARY KEY,
  short_description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pgx_drug_name_map (
  drug_name TEXT PRIMARY KEY,
  display_name TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS food_exposure (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_no INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  session_id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL,
  admin_username TEXT,
  participant_no INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patient_portal_access (
  participant_no INTEGER PRIMARY KEY,
  password_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_no) REFERENCES patients(participant_no) ON DELETE CASCADE
);
