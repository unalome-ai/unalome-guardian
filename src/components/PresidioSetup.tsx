import { useState, useEffect, useRef } from "react";
import {
  Shield,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Download,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface PresidioSetupProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface ProgressEvent {
  step: string;
  percent: number;
  message: string;
}

type SetupPhase = "idle" | "running" | "done" | "error" | "cancelled";

const STEPS = [
  { key: "venv", label: "Create Python environment" },
  { key: "pip", label: "Install Presidio libraries" },
  { key: "spacy", label: "Download language model" },
] as const;

export function PresidioSetup({ onComplete, onSkip }: PresidioSetupProps) {
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [percent, setPercent] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [logLines, setLogLines] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      if (!mounted) return;
      unlisten = await listen<ProgressEvent>("presidio-setup-progress", (event) => {
        const { step, percent: pct, message } = event.payload;

        if (step === "done") {
          setPhase("done");
          setPercent(100);
          setCompletedSteps(new Set(["venv", "pip", "spacy"]));
          setCurrentStep("");
          setTimeout(() => onCompleteRef.current(), 1500);
          return;
        }

        if (step === "error") {
          setPhase("error");
          setErrorMessage(message);
          return;
        }

        if (step === "cancelled") {
          setPhase("cancelled");
          return;
        }

        // Active step
        setPhase("running");
        setPercent(pct);
        setCurrentStep(step);

        // Mark previous steps as completed
        setCompletedSteps((prev) => {
          const next = new Set(prev);
          const stepOrder = ["venv", "pip", "spacy"];
          const idx = stepOrder.indexOf(step);
          for (let i = 0; i < idx; i++) {
            next.add(stepOrder[i]);
          }
          return next;
        });

        // Add log line
        if (message) {
          setLogLines((prev) => [...prev.slice(-49), message]);
        }
      });
    })();

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  const handleStart = async () => {
    setPhase("running");
    setPercent(0);
    setLogLines([]);
    setCompletedSteps(new Set());
    setErrorMessage("");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("start_presidio_setup");
    } catch (e) {
      setPhase("error");
      setErrorMessage(String(e));
    }
  };

  const handleCancel = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("cancel_presidio_setup");
    } catch {
      // ignore
    }
  };

  const handleSkip = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("skip_presidio_setup");
    } catch {
      // ignore
    }
    onSkip();
  };

  const getStepIcon = (stepKey: string) => {
    if (completedSteps.has(stepKey)) {
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    }
    if (currentStep === stepKey && phase === "running") {
      return <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />;
    }
    if (phase === "error" && currentStep === stepKey) {
      return <XCircle className="w-5 h-5 text-rose-400" />;
    }
    return <Circle className="w-5 h-5 text-white/20" />;
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass-card p-8 max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white">
            Set Up AI-Powered Scanner
          </h2>
          <p className="text-sm text-white/40">
            One-time setup &middot; ~500MB download
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step) => (
            <div
              key={step.key}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03]"
            >
              {getStepIcon(step.key)}
              <span
                className={`text-sm ${
                  completedSteps.has(step.key)
                    ? "text-white/70"
                    : currentStep === step.key
                    ? "text-white"
                    : "text-white/30"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Progress bar — visible when running or done */}
        {(phase === "running" || phase === "done") && (
          <div className="space-y-2">
            <Progress
              value={percent}
              className="h-2.5 [&>div]:!bg-amber-500"
            />
            <p className="text-xs text-white/40 text-right">{percent}%</p>
          </div>
        )}

        {/* Log output — visible when running */}
        {phase === "running" && logLines.length > 0 && (
          <div
            ref={logRef}
            className="h-28 overflow-y-auto rounded-xl bg-black/30 border border-white/5 p-3 font-mono text-[11px] text-white/50 space-y-0.5"
          >
            {logLines.slice(-5).map((line, i) => (
              <div key={i} className="truncate">
                &gt; {line}
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {phase === "error" && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-300">
            {errorMessage || "Setup failed. Please try again."}
          </div>
        )}

        {/* Done state */}
        {phase === "done" && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-300 text-center">
            Setup complete! Starting scanner...
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div>
            {phase === "idle" && (
              <button
                onClick={handleSkip}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                Skip — use local scanner only
              </button>
            )}
            {phase === "cancelled" && (
              <span className="text-xs text-white/40">Setup cancelled</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {phase === "running" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="text-white/50 hover:text-white/80"
              >
                Cancel
              </Button>
            )}

            {(phase === "idle" || phase === "cancelled") && (
              <Button
                onClick={handleStart}
                className="action-button !px-6"
              >
                <Download className="w-4 h-4" />
                Start Setup
              </Button>
            )}

            {phase === "error" && (
              <Button
                onClick={handleStart}
                className="action-button !px-6"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
