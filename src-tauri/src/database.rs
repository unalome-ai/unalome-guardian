use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GuardianScan {
    pub id: String,
    pub timestamp: i64,
    pub text_preview: String,
    pub match_count: i32,
    pub exposure_score: i32,
    pub engine: String,
    pub redaction_style: String,
    pub full_result_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GuardianStats {
    pub total_scans: i32,
    pub total_matches: i32,
    pub avg_exposure: f64,
    pub critical_count: i32,
    pub high_count: i32,
    pub medium_count: i32,
    pub low_count: i32,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&db_path)?;
        let db = Database { conn };
        db.create_tables()?;
        Ok(db)
    }

    fn db_path() -> PathBuf {
        let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        base.join("ai.unalome.guardian").join("guardian.db")
    }

    fn create_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS guardian_scans (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                text_preview TEXT NOT NULL,
                match_count INTEGER NOT NULL,
                exposure_score INTEGER NOT NULL,
                engine TEXT NOT NULL,
                redaction_style TEXT NOT NULL,
                full_result_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sensitive_matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id TEXT NOT NULL,
                match_type TEXT NOT NULL,
                start_pos INTEGER NOT NULL,
                end_pos INTEGER NOT NULL,
                confidence INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                original_text TEXT NOT NULL,
                FOREIGN KEY (scan_id) REFERENCES guardian_scans(id)
            );

            CREATE TABLE IF NOT EXISTS redaction_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                scan_id TEXT NOT NULL,
                user_action TEXT NOT NULL,
                reason TEXT,
                FOREIGN KEY (scan_id) REFERENCES guardian_scans(id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON guardian_scans(timestamp);
            CREATE INDEX IF NOT EXISTS idx_matches_scan ON sensitive_matches(scan_id);
            CREATE INDEX IF NOT EXISTS idx_audit_scan ON redaction_audit(scan_id);"
        )?;
        Ok(())
    }

    pub fn save_scan(&self, scan: &GuardianScan, matches_json: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO guardian_scans (id, timestamp, text_preview, match_count, exposure_score, engine, redaction_style, full_result_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                scan.id,
                scan.timestamp,
                scan.text_preview,
                scan.match_count,
                scan.exposure_score,
                scan.engine,
                scan.redaction_style,
                scan.full_result_json,
            ],
        )?;

        // Store individual matches
        if let Ok(matches) = serde_json::from_str::<Vec<serde_json::Value>>(matches_json) {
            for m in &matches {
                let match_type = m["type"].as_str().unwrap_or("");
                let start = m["start"].as_i64().unwrap_or(0) as i32;
                let end = m["end"].as_i64().unwrap_or(0) as i32;
                let confidence = m["confidence"].as_i64().unwrap_or(0) as i32;
                let risk_level = m["risk_level"].as_str().unwrap_or("low");
                let original = m["original"].as_str().unwrap_or("");

                self.conn.execute(
                    "INSERT INTO sensitive_matches (scan_id, match_type, start_pos, end_pos, confidence, risk_level, original_text)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![scan.id, match_type, start, end, confidence, risk_level, original],
                )?;
            }
        }

        Ok(())
    }

    pub fn get_scans(&self, limit: i32) -> Result<Vec<GuardianScan>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, text_preview, match_count, exposure_score, engine, redaction_style, full_result_json
             FROM guardian_scans ORDER BY timestamp DESC LIMIT ?1"
        )?;

        let scans = stmt.query_map(params![limit], |row| {
            Ok(GuardianScan {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                text_preview: row.get(2)?,
                match_count: row.get(3)?,
                exposure_score: row.get(4)?,
                engine: row.get(5)?,
                redaction_style: row.get(6)?,
                full_result_json: row.get(7)?,
            })
        })?.collect::<Result<Vec<_>>>()?;

        Ok(scans)
    }

    pub fn get_scan_by_id(&self, id: &str) -> Result<Option<GuardianScan>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, text_preview, match_count, exposure_score, engine, redaction_style, full_result_json
             FROM guardian_scans WHERE id = ?1"
        )?;

        let mut scans = stmt.query_map(params![id], |row| {
            Ok(GuardianScan {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                text_preview: row.get(2)?,
                match_count: row.get(3)?,
                exposure_score: row.get(4)?,
                engine: row.get(5)?,
                redaction_style: row.get(6)?,
                full_result_json: row.get(7)?,
            })
        })?;

        match scans.next() {
            Some(Ok(scan)) => Ok(Some(scan)),
            _ => Ok(None),
        }
    }

    pub fn get_stats(&self) -> Result<GuardianStats> {
        let total_scans: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM guardian_scans", [], |row| row.get(0)
        )?;

        let total_matches: i32 = self.conn.query_row(
            "SELECT COALESCE(SUM(match_count), 0) FROM guardian_scans", [], |row| row.get(0)
        )?;

        let avg_exposure: f64 = self.conn.query_row(
            "SELECT COALESCE(AVG(exposure_score), 0.0) FROM guardian_scans", [], |row| row.get(0)
        )?;

        let critical_count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM sensitive_matches WHERE risk_level = 'critical'", [], |row| row.get(0)
        )?;

        let high_count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM sensitive_matches WHERE risk_level = 'high'", [], |row| row.get(0)
        )?;

        let medium_count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM sensitive_matches WHERE risk_level = 'medium'", [], |row| row.get(0)
        )?;

        let low_count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM sensitive_matches WHERE risk_level = 'low'", [], |row| row.get(0)
        )?;

        Ok(GuardianStats {
            total_scans,
            total_matches,
            avg_exposure,
            critical_count,
            high_count,
            medium_count,
            low_count,
        })
    }

    pub fn delete_scan(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM sensitive_matches WHERE scan_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM redaction_audit WHERE scan_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM guardian_scans WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(Ok(val)) => Ok(Some(val)),
            _ => Ok(None),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn log_action(&self, scan_id: &str, action: &str, reason: &str) -> Result<()> {
        let timestamp = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT INTO redaction_audit (timestamp, scan_id, user_action, reason)
             VALUES (?1, ?2, ?3, ?4)",
            params![timestamp, scan_id, action, reason],
        )?;
        Ok(())
    }
}
