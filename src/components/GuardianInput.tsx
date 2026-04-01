import { useState } from "react";
import {
  Loader2,
  Clipboard,
  Shield,
  FileText,
  Cpu,
  Regex,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RedactionStyle, GuardianResult } from "@/types";

type EnginePreference = "auto" | "presidio" | "local";

const ENGINE_OPTIONS: { value: EnginePreference; label: string; desc: string; icon: typeof Cpu }[] = [
  { value: "auto", label: "Auto", desc: "Presidio first, fallback to local", icon: Zap },
  { value: "presidio", label: "Presidio", desc: "NLP-powered (requires setup)", icon: Cpu },
  { value: "local", label: "Local", desc: "Regex scanner, always available", icon: Regex },
];

interface GuardianInputProps {
  onResult: (result: GuardianResult) => void;
}

const REDACTION_STYLES: { value: RedactionStyle; label: string; desc: string }[] = [
  { value: "replace", label: "Replace", desc: "Replace with <TYPE>" },
  { value: "hash", label: "Hash", desc: "Replace with partial hash" },
  { value: "placeholder", label: "Placeholder", desc: "Replace with [REDACTED]" },
];

export function GuardianInput({ onResult }: GuardianInputProps) {
  const [text, setText] = useState("");
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>("replace");
  const [enginePref, setEnginePref] = useState<EnginePreference>("auto");
  const [loading, setLoading] = useState(false);
  const [presidioStatus, setPresidioStatus] = useState<"unknown" | "online" | "offline">("unknown");

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip);
    } catch {
      // Clipboard not available
    }
  };

  const checkPresidio = async (): Promise<boolean> => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const status = await invoke<string>("get_presidio_status");
      if (status === "online") {
        setPresidioStatus("online");
        return true;
      }
    } catch {
      // not available
    }
    setPresidioStatus("offline");
    return false;
  };

  const handleScan = async () => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      const { scanWithPresidioBackend, scanLocal } = await import("@/lib/guardian/scanner");

      let result: GuardianResult;

      if (enginePref === "local") {
        setPresidioStatus("offline");
        result = scanLocal(text, redactionStyle);
      } else if (enginePref === "presidio") {
        const presidioAvailable = await checkPresidio();
        if (presidioAvailable) {
          const presidioResult = await scanWithPresidioBackend(text, redactionStyle);
          result = presidioResult || scanLocal(text, redactionStyle);
        } else {
          result = scanLocal(text, redactionStyle);
        }
      } else {
        // Auto: try Presidio first, fallback to local
        const presidioAvailable = await checkPresidio();
        if (presidioAvailable) {
          const presidioResult = await scanWithPresidioBackend(text, redactionStyle);
          result = presidioResult || scanLocal(text, redactionStyle);
        } else {
          result = scanLocal(text, redactionStyle);
        }
      }

      // Save to backend
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("save_guardian_scan", {
          id: result.scanId,
          textPreview: text.slice(0, 200),
          matchCount: result.matchCount,
          exposureScore: result.dataExposureScore,
          engine: result.engine,
          redactionStyle: result.redactionStyle,
          fullResultJson: JSON.stringify(result),
          matchesJson: JSON.stringify(result.matches),
        });
      } catch {
        // Backend not available
      }

      onResult(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Text Input */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            Text to Scan
          </h2>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePaste}
              className="text-white/50 hover:text-white/80"
            >
              <Clipboard className="w-4 h-4 mr-1" />
              Paste
            </Button>
            <span className="text-xs text-white/30">{text.length} chars</span>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the text you want to scan for sensitive data (PII, secrets, credentials)..."
          className="w-full h-44 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 placeholder:text-white/25 resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all"
        />
      </div>

      {/* Redaction Style + Engine Status */}
      <div className="glass-card p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white/80 mb-3">Redaction Style</h3>
            <div className="flex gap-2">
              {REDACTION_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setRedactionStyle(style.value)}
                  className={`px-4 py-2.5 rounded-xl text-sm transition-all ${
                    redactionStyle === style.value
                      ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                      : "glass text-white/50 hover:text-white/70"
                  }`}
                >
                  <div className="font-medium">{style.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{style.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
              Engine
              <div className={`w-2 h-2 rounded-full ${
                presidioStatus === "online" ? "bg-emerald-400" :
                presidioStatus === "offline" ? "bg-rose-400" :
                "bg-white/30"
              }`} />
            </h3>
            <div className="flex gap-2">
              {ENGINE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setEnginePref(opt.value)}
                    className={`px-4 py-2.5 rounded-xl text-sm transition-all ${
                      enginePref === opt.value
                        ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                        : "glass text-white/50 hover:text-white/70"
                    }`}
                  >
                    <div className="font-medium flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-60">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Scan Button */}
      <div className="flex items-center justify-end">
        <Button
          onClick={handleScan}
          disabled={loading || !text.trim()}
          className="action-button !px-8 !py-3 !text-base disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Shield className="w-5 h-5" />
              Scan for PII
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
