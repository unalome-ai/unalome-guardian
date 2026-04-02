#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod setup;

use database::{Database, GuardianScan, GuardianStats};
use serde::Serialize;
use serde_json::Value;
use setup::SetupManager;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    db: Mutex<Database>,
    presidio: Arc<Mutex<Option<PresidioProcess>>>,
    setup_manager: Arc<SetupManager>,
}

struct PresidioProcess {
    #[allow(dead_code)]
    child: Child,
    stdin: BufWriter<std::process::ChildStdin>,
    stdout: BufReader<std::process::ChildStdout>,
}

impl PresidioProcess {
    fn send(&mut self, request: &Value) -> Result<Value, String> {
        let line = serde_json::to_string(request).map_err(|e| e.to_string())?;
        self.stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("write to presidio stdin: {e}"))?;
        self.stdin
            .write_all(b"\n")
            .map_err(|e| format!("write newline: {e}"))?;
        self.stdin.flush().map_err(|e| format!("flush stdin: {e}"))?;

        let mut response_line = String::new();
        self.stdout
            .read_line(&mut response_line)
            .map_err(|e| format!("read from presidio stdout: {e}"))?;

        serde_json::from_str(&response_line)
            .map_err(|e| format!("parse presidio response: {e}"))
    }
}

fn resolve_python_script() -> Option<String> {
    // 1. Check bundled resources (inside .app/Contents/Resources/)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Tauri bundles resources next to the binary on Linux/Windows
            let beside_exe = exe_dir.join("presidio_cli.py");
            if beside_exe.exists() {
                return beside_exe.to_str().map(|s| s.to_string());
            }
            // macOS: .app/Contents/MacOS/../Resources/
            let macos_resource = exe_dir.join("../Resources/presidio_cli.py");
            if macos_resource.exists() {
                return macos_resource.canonicalize().ok()?.to_str().map(|s| s.to_string());
            }
        }
    }

    // 2. Development paths (running from source)
    let dev_candidates = [
        "../guardian_backend/presidio_cli.py",
        "guardian_backend/presidio_cli.py",
    ];
    for path in &dev_candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    None
}

fn spawn_presidio(python_bin: &str) -> Option<PresidioProcess> {
    let script_path = resolve_python_script()?;

    let script_dir = std::path::Path::new(&script_path)
        .parent()
        .map(|p| p.to_path_buf());

    let mut cmd = Command::new(python_bin);
    cmd.arg(&script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref dir) = script_dir {
        cmd.current_dir(dir);
    }

    let mut child = cmd.spawn().ok()?;

    let stderr = child.stderr.take();
    let stdin = BufWriter::new(child.stdin.take()?);
    let mut stdout = BufReader::new(child.stdout.take()?);

    let start = Instant::now();
    let timeout = Duration::from_secs(30);

    loop {
        if start.elapsed() > timeout {
            eprintln!("presidio: timeout waiting for ready signal");
            let _ = child.kill();
            return None;
        }

        let mut line = String::new();
        match stdout.read_line(&mut line) {
            Ok(0) => {
                if let Some(err) = stderr {
                    let err_reader = BufReader::new(err);
                    for line in err_reader.lines() {
                        if let Ok(l) = line {
                            eprintln!("presidio: stderr: {l}");
                        }
                    }
                }
                eprintln!("presidio: process exited before ready");
                return None;
            }
            Ok(_) => {
                if let Ok(val) = serde_json::from_str::<Value>(&line) {
                    if val.get("ready") == Some(&Value::Bool(true)) {
                        eprintln!("presidio: subprocess ready");
                        return Some(PresidioProcess {
                            child,
                            stdin,
                            stdout,
                        });
                    }
                }
            }
            Err(e) => {
                eprintln!("presidio: error reading stdout: {e}");
                let _ = child.kill();
                return None;
            }
        }
    }
}

#[tauri::command]
fn scan_with_presidio(
    state: State<AppState>,
    text: String,
    redaction_style: String,
    score_threshold: f64,
) -> Result<Value, String> {
    let mut guard = state.presidio.lock().map_err(|e| e.to_string())?;
    let process = guard.as_mut().ok_or("Presidio not available")?;

    let request = serde_json::json!({
        "action": "scan",
        "text": text,
        "redaction_style": redaction_style,
        "score_threshold": score_threshold,
    });

    process.send(&request)
}

#[tauri::command]
fn get_presidio_status(state: State<AppState>) -> String {
    match state.presidio.lock() {
        Ok(guard) => {
            if guard.is_some() {
                "online".to_string()
            } else {
                "offline".to_string()
            }
        }
        Err(_) => "offline".to_string(),
    }
}

#[tauri::command]
fn save_guardian_scan(
    state: State<AppState>,
    id: String,
    text_preview: String,
    match_count: i32,
    exposure_score: i32,
    engine: String,
    redaction_style: String,
    full_result_json: String,
    matches_json: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let timestamp = chrono::Utc::now().timestamp_millis();

    let scan = GuardianScan {
        id,
        timestamp,
        text_preview,
        match_count,
        exposure_score,
        engine,
        redaction_style,
        full_result_json,
    };

    db.save_scan(&scan, &matches_json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_scan_history(state: State<AppState>, limit: i32) -> Result<Vec<GuardianScan>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_scans(limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_scan_detail(state: State<AppState>, id: String) -> Result<Option<GuardianScan>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_scan_by_id(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_guardian_stats(state: State<AppState>) -> Result<GuardianStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_scan(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_scan(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn log_guardian_action(
    state: State<AppState>,
    scan_id: String,
    action: String,
    reason: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.log_action(&scan_id, &action, &reason).map_err(|e| e.to_string())
}

// --- New setup commands ---

#[derive(Serialize)]
struct SetupStatus {
    status: String,
    venv_ready: bool,
}

#[tauri::command]
fn get_setup_status(state: State<AppState>) -> Result<SetupStatus, String> {
    let venv_ready = state.setup_manager.is_venv_ready();

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let status = match db.get_setting("presidio_setup_status").map_err(|e| e.to_string())? {
        Some(s) => s,
        None => {
            if venv_ready {
                "complete".to_string()
            } else {
                "needed".to_string()
            }
        }
    };

    Ok(SetupStatus { status, venv_ready })
}

#[tauri::command]
fn start_presidio_setup(
    app: AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let setup = state.setup_manager.clone();
    let presidio = state.presidio.clone();
    let db_mutex = {
        // We need a way to access db after setup - clone the Arc reference
        // But db is behind Mutex, not Arc<Mutex>. We'll set the setting via the state.
        // Actually, we just need the data_dir for the python path.
        let _ = &state.db;
        ()
    };
    let _ = db_mutex;

    // Get a reference to the DB through a closure-friendly path
    // We'll set the setting after setup completes by accessing state through app
    let app_clone = app.clone();

    std::thread::spawn(move || {
        match setup.run_setup(&app_clone) {
            Ok(()) => {
                eprintln!("presidio: setup complete, spawning subprocess...");

                // Set DB setting
                let state: State<'_, AppState> = app_clone.state::<AppState>();
                if let Ok(db) = state.db.lock() {
                    let _ = db.set_setting("presidio_setup_status", "complete");
                }

                // Spawn presidio with venv python
                let python = setup.venv_python();
                let python_str = python.to_str().unwrap_or("python3");
                let process = spawn_presidio(python_str);
                if let Ok(mut guard) = presidio.lock() {
                    *guard = process;
                }
            }
            Err(e) if e == "cancelled" => {
                let _ = app_clone.emit(
                    "presidio-setup-progress",
                    setup::SetupProgressEvent {
                        step: "cancelled".to_string(),
                        percent: 0,
                        message: "Setup cancelled".to_string(),
                    },
                );
            }
            Err(e) => {
                let _ = app_clone.emit(
                    "presidio-setup-progress",
                    setup::SetupProgressEvent {
                        step: "error".to_string(),
                        percent: 0,
                        message: e,
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn cancel_presidio_setup(state: State<AppState>) -> Result<(), String> {
    state.setup_manager.cancel();
    Ok(())
}

#[tauri::command]
fn skip_presidio_setup(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting("presidio_setup_status", "skipped")
        .map_err(|e| e.to_string())
}

fn main() {
    let db = Database::new().expect("Failed to initialize database");

    // Determine data dir for venv
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("ai.unalome.guardian");

    let setup_manager = Arc::new(SetupManager::new(data_dir));

    // Try to spawn Presidio subprocess — prefer venv python if available
    eprintln!("presidio: attempting to spawn subprocess...");
    let python_bin = if setup_manager.is_venv_ready() {
        setup_manager
            .venv_python()
            .to_str()
            .unwrap_or("python3")
            .to_string()
    } else {
        "python3".to_string()
    };
    let presidio = spawn_presidio(&python_bin);
    if presidio.is_none() {
        eprintln!("presidio: not available, will use local scanner fallback");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            db: Mutex::new(db),
            presidio: Arc::new(Mutex::new(presidio)),
            setup_manager,
        })
        .invoke_handler(tauri::generate_handler![
            save_guardian_scan,
            get_scan_history,
            get_scan_detail,
            get_guardian_stats,
            delete_scan,
            log_guardian_action,
            scan_with_presidio,
            get_presidio_status,
            get_setup_status,
            start_presidio_setup,
            cancel_presidio_setup,
            skip_presidio_setup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
