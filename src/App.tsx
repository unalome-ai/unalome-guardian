import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  History,
  BarChart3,
  Scan,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { GuardianInput } from "@/components/GuardianInput";
import { GuardianResults } from "@/components/GuardianResults";
import { GuardianHistory } from "@/components/GuardianHistory";
import { PresidioSetup } from "@/components/PresidioSetup";
import type { GuardianResult } from "@/types";

type View = "scan" | "history" | "setup";

interface Stats {
  total_scans: number;
  total_matches: number;
  avg_exposure: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

function App() {
  const [view, setView] = useState<View>("scan");
  const [result, setResult] = useState<GuardianResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<Stats>("get_guardian_stats");
      setStats(data);
    } catch {
      // Backend not available
    }
  }, []);

  useEffect(() => {
    loadStats();
    // Check if Presidio setup is needed
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<{ status: string; venv_ready: boolean }>("get_setup_status");
        if (result.status === "needed") {
          setView("setup");
        }
      } catch {
        // Backend not available
      }
    })();
  }, [loadStats]);

  const handleResult = (res: GuardianResult) => {
    setResult(res);
    loadStats();
  };

  const handleBack = () => {
    setResult(null);
  };

  const handleViewResult = (res: GuardianResult) => {
    setResult(res);
    setView("scan");
  };

  return (
    <div className="app-bg min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/60 border-b border-white/6">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                Unalome Guardian
              </h1>
              <span className="text-[10px] text-white/30 uppercase tracking-widest">
                v0.1.0 — Privacy Data Minimizer
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <button
              onClick={() => { setView("scan"); setResult(null); }}
              disabled={view === "setup"}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                view === "scan"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/5"
              } disabled:opacity-30 disabled:pointer-events-none`}
            >
              <Scan className="w-4 h-4" />
              Scan
            </button>
            <button
              onClick={() => { setView("history"); setResult(null); }}
              disabled={view === "setup"}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
                view === "history"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/5"
              } disabled:opacity-30 disabled:pointer-events-none`}
            >
              <History className="w-4 h-4" />
              History
            </button>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button
              onClick={() => { setView("setup"); setResult(null); }}
              disabled={view === "setup"}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                view === "setup"
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/5"
              } disabled:opacity-30 disabled:pointer-events-none`}
              title="Presidio Setup"
            >
              <Settings className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>

      {/* Stats Bar */}
      {stats && stats.total_scans > 0 && (
        <div className="max-w-5xl mx-auto px-6 pt-4">
          <div className="flex items-center gap-6 text-xs text-white/40">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{stats.total_scans} scans</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>{stats.total_matches} matches found</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400/50" />
              <span>{stats.critical_count} critical</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-orange-400/50" />
              <span>{stats.high_count} high</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400/50" />
              <span>{stats.medium_count} medium</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {view === "setup" && (
          <PresidioSetup
            onComplete={() => { setView("scan"); loadStats(); }}
            onSkip={() => setView("scan")}
          />
        )}
        {view === "scan" && !result && <GuardianInput onResult={handleResult} />}
        {view === "scan" && result && (
          <GuardianResults result={result} onBack={handleBack} />
        )}
        {view === "history" && <GuardianHistory onViewResult={handleViewResult} />}
      </main>
    </div>
  );
}

export default App;
