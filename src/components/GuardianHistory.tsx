import { useState, useEffect, useCallback } from "react";
import {
  History,
  Trash2,
  Eye,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GuardianScan, GuardianResult } from "@/types";

function getExposureColor(score: number): string {
  if (score >= 70) return "text-rose-400";
  if (score >= 40) return "text-amber-400";
  return "text-emerald-400";
}

interface GuardianHistoryProps {
  onViewResult: (result: GuardianResult) => void;
}

export function GuardianHistory({ onViewResult }: GuardianHistoryProps) {
  const [scans, setScans] = useState<GuardianScan[]>([]);
  const [loading, setLoading] = useState(true);

  const loadScans = useCallback(async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<GuardianScan[]>("get_scan_history", { limit: 50 });
      setScans(result);
    } catch {
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  const handleDelete = async (id: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_scan", { id });
      setScans((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Backend not available
    }
  };

  const handleView = (scan: GuardianScan) => {
    try {
      const result: GuardianResult = JSON.parse(scan.full_result_json);
      onViewResult(result);
    } catch {
      // Invalid JSON
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-12 text-center">
        <RefreshCw className="w-8 h-8 text-white/30 animate-spin mx-auto mb-3" />
        <p className="text-sm text-white/40">Loading scan history...</p>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Shield className="w-12 h-12 text-white/20 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white/60 mb-1">No scans yet</h3>
        <p className="text-sm text-white/40">
          Run your first PII scan to see results here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-amber-400" />
          Scan History
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadScans}
          className="text-white/50 hover:text-white/80"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {scans.map((scan) => {
          const exposureColor = getExposureColor(scan.exposure_score);
          const date = new Date(scan.timestamp);

          return (
            <div
              key={scan.id}
              className="glass-card p-4 flex items-center gap-4 hover:bg-white/6 transition-colors"
            >
              <div className={`text-lg font-bold ${exposureColor} w-10 text-center`}>
                {scan.exposure_score}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/80 truncate">
                  {scan.text_preview || "No preview"}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-white/40">
                    {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <Badge className={`border-0 text-[10px] ${
                    scan.engine === "presidio"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-blue-500/20 text-blue-400"
                  }`}>
                    {scan.engine}
                  </Badge>
                  <Badge className="bg-white/10 text-white/50 border-0 text-[10px]">
                    {scan.redaction_style}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-white/40">
                  {scan.match_count} match{scan.match_count !== 1 ? "es" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleView(scan)}
                  className="text-white/30 hover:text-white/70 h-8 w-8"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(scan.id)}
                  className="text-white/30 hover:text-rose-400 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
