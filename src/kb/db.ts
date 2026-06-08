import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { env } from '../config/env'

export type KbDatabase = Database.Database

/**
 * Open (and migrate) a KB database. Pass ':memory:' for tests.
 * The per-org knowledge base stores learned/taught element locators so the
 * generator can emit locators proven against a specific org's app.
 */
export const openDb = (file: string): KbDatabase => {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  }
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      org        TEXT NOT NULL,
      phrase     TEXT NOT NULL,
      norm       TEXT NOT NULL,
      locator    TEXT NOT NULL,
      strategy   TEXT NOT NULL,
      page       TEXT,
      provenance TEXT NOT NULL DEFAULT 'taught',
      hits       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_org_norm ON kb_entries(org, norm);

    CREATE TABLE IF NOT EXISTS usage_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT NOT NULL,
      method      TEXT NOT NULL,
      path        TEXT NOT NULL,
      org         TEXT,
      status      INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      steps       INTEGER,
      confidence  REAL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(ts);
  `)
  return db
}

/** Shared singleton used by the running app (tests open their own in-memory db). */
export const db = openDb(env.KB_DB_PATH)
