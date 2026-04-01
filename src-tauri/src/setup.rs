use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct SetupProgressEvent {
    pub step: String,
    pub percent: u8,
    pub message: String,
}

pub struct SetupManager {
    data_dir: PathBuf,
    cancel: Arc<AtomicBool>,
}

impl SetupManager {
    pub fn new(data_dir: PathBuf) -> Self {
        Self {
            data_dir,
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn venv_dir(&self) -> PathBuf {
        self.data_dir.join("venv")
    }

    pub fn venv_python(&self) -> PathBuf {
        self.data_dir.join("venv").join("bin").join("python3")
    }

    fn venv_pip(&self) -> PathBuf {
        self.data_dir.join("venv").join("bin").join("pip")
    }

    fn ready_marker(&self) -> PathBuf {
        self.data_dir.join("venv").join(".guardian_ready")
    }

    pub fn is_venv_ready(&self) -> bool {
        self.venv_python().exists() && self.ready_marker().exists()
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn reset_cancel(&self) {
        self.cancel.store(false, Ordering::SeqCst);
    }

    fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    fn emit_progress(app: &AppHandle, step: &str, percent: u8, message: &str) {
        let _ = app.emit(
            "presidio-setup-progress",
            SetupProgressEvent {
                step: step.to_string(),
                percent,
                message: message.to_string(),
            },
        );
    }

    fn run_command_with_progress(
        &self,
        app: &AppHandle,
        step: &str,
        percent_start: u8,
        percent_end: u8,
        cmd: &str,
        args: &[&str],
    ) -> Result<(), String> {
        Self::emit_progress(app, step, percent_start, &format!("Starting {}...", step));

        let mut command = Command::new(cmd);
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn().map_err(|e| format!("Failed to spawn {cmd}: {e}"))?;

        // Read stderr in a background thread to avoid blocking
        let stderr = child.stderr.take();
        let cancel = self.cancel.clone();
        let app_clone = app.clone();
        let step_str = step.to_string();
        let range = percent_end - percent_start;

        let stderr_handle = std::thread::spawn(move || {
            let mut lines = Vec::new();
            if let Some(stderr) = stderr {
                let reader = BufReader::new(stderr);
                let mut line_count: u32 = 0;
                for line in reader.lines() {
                    if cancel.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(l) = line {
                        line_count += 1;
                        // Estimate progress within range based on output lines
                        let progress = ((line_count.min(100) as u16 * range as u16) / 100).min(range as u16) as u8;
                        let percent = percent_start.saturating_add(progress);
                        Self::emit_progress(&app_clone, &step_str, percent, &l);
                        lines.push(l);
                    }
                }
            }
            lines
        });

        // Also read stdout
        let stdout = child.stdout.take();
        let cancel2 = self.cancel.clone();
        let app_clone2 = app.clone();
        let step_str2 = step.to_string();

        let stdout_handle = std::thread::spawn(move || {
            let mut lines = Vec::new();
            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if cancel2.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(l) = line {
                        Self::emit_progress(&app_clone2, &step_str2, percent_start, &l);
                        lines.push(l);
                    }
                }
            }
            lines
        });

        // Check for cancellation while waiting
        let status = child.wait().map_err(|e| format!("Failed to wait for {cmd}: {e}"))?;

        let _ = stderr_handle.join();
        let _ = stdout_handle.join();

        if self.is_cancelled() {
            return Err("cancelled".to_string());
        }

        if !status.success() {
            return Err(format!(
                "{} failed with exit code: {}",
                step,
                status.code().unwrap_or(-1)
            ));
        }

        Self::emit_progress(app, step, percent_end, &format!("{} complete", step));
        Ok(())
    }

    pub fn run_setup(&self, app: &AppHandle) -> Result<(), String> {
        self.reset_cancel();

        // Ensure data dir exists
        std::fs::create_dir_all(&self.data_dir)
            .map_err(|e| format!("Failed to create data dir: {e}"))?;

        // Step 1: Create venv (0-10%)
        if self.is_cancelled() {
            return Err("cancelled".to_string());
        }
        let venv_dir = self.venv_dir();
        let venv_str = venv_dir.to_str().ok_or("Invalid venv path")?;
        self.run_command_with_progress(app, "venv", 0, 10, "python3", &["-m", "venv", venv_str])?;

        // Step 2: pip install (10-70%)
        if self.is_cancelled() {
            return Err("cancelled".to_string());
        }
        let pip = self.venv_pip();
        let pip_str = pip.to_str().ok_or("Invalid pip path")?;
        self.run_command_with_progress(
            app,
            "pip",
            10,
            70,
            pip_str,
            &["install", "presidio-analyzer", "presidio-anonymizer"],
        )?;

        // Step 3: spaCy model (70-98%)
        if self.is_cancelled() {
            return Err("cancelled".to_string());
        }
        let python = self.venv_python();
        let python_str = python.to_str().ok_or("Invalid python path")?;
        self.run_command_with_progress(
            app,
            "spacy",
            70,
            98,
            python_str,
            &["-m", "spacy", "download", "en_core_web_lg"],
        )?;

        // Done: write marker
        let marker = self.ready_marker();
        std::fs::write(&marker, "ready").map_err(|e| format!("Failed to write marker: {e}"))?;

        Self::emit_progress(app, "done", 100, "Setup complete!");
        Ok(())
    }
}
