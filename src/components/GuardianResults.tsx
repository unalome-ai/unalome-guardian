import { useState } from "react";
import {
  ArrowLeft,
  Copy,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertOctagon,
  ShieldAlert,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { GuardianResult, GuardianMatch, RiskLevel } from "@/types";

const RISK_CONFIG: Record<RiskLevel, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  critical: { icon: AlertOctagon, color: "text-rose-400", bg: "bg-rose-500/20", label: "Critical" },
  high: { icon: ShieldAlert, color: "text-orange-400", bg: "bg-orange-500/20", label: "High" },
  medium: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/20", label: "Medium" },
  low: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/20", label: "Low" },
};

function getExposureColor(score: number): string {
  if (score >= 70) return "text-rose-400";
  if (score >= 40) return "text-amber-400";
  return "text-emerald-400";
}

function getExposureBg(score: number): string {
  if (score >= 70) return "bg-rose-500/10 border-rose-500/20";
  if (score >= 40) return "bg-amber-500/10 border-amber-500/20";
  return "bg-emerald-500/10 border-emerald-500/20";
}

interface GuardianResultsProps {
  result: GuardianResult;
  onBack: () => void;
}

export function GuardianResults({ result, onBack }: GuardianResultsProps) {
  const [expandedMatches, setExpandedMatches] = useState<Set<number>>(new Set());

  const exposureColor = getExposureColor(result.dataExposureScore);
  const exposureBg = getExposureBg(result.dataExposureScore);

  const critical = result.matches.filter((m) => m.risk_level === "critical").length;
  const high = result.matches.filter((m) => m.risk_level === "high").length;
  const medium = result.matches.filter((m) => m.risk_level === "medium").length;
  const low = result.matches.filter((m) => m.risk_level === "low").length;

  const toggleMatch = (idx: number) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const copyRedacted = () => {
    navigator.clipboard.writeText(result.redactedText);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  return (
    <div className="space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-white/50 hover:text-white/80">
          <ArrowLeft className="w-4 h-4 mr-2" />
          New Scan
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={copyRedacted} className="text-white/50 hover:text-white/80">
            <Shield className="w-4 h-4 mr-1" />
            Copy Redacted
          </Button>
          <Button variant="ghost" onClick={copyJson} className="text-white/50 hover:text-white/80">
            <Copy className="w-4 h-4 mr-1" />
            JSON
          </Button>
        </div>
      </div>

      {/* Exposure Score Banner */}
      <div className={`glass-card p-6 border ${exposureBg}`}>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-4xl font-bold ${exposureColor}`}>
              {result.dataExposureScore}
            </div>
            <div className="text-xs text-white/40 mt-1">Exposure Score</div>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-4xl font-bold text-white">
              {result.matchCount}
            </div>
            <div className="text-xs text-white/40 mt-1">Matches Found</div>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <Badge className={`${
              result.engine === "presidio"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-blue-500/20 text-blue-400 border-blue-500/30"
            } border text-sm px-3 py-1`}>
              {result.engine === "presidio" ? "Presidio" : "Local Scanner"}
            </Badge>
            <div className="text-xs text-white/40 mt-1">Engine</div>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <Badge className="bg-white/10 text-white/50 border-0 text-sm px-3 py-1">
              {result.redactionStyle}
            </Badge>
            <div className="text-xs text-white/40 mt-1">Redaction Style</div>
          </div>
        </div>
      </div>

      {/* Risk Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-rose-400">{critical}</div>
          <div className="text-xs text-white/40">Critical</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{high}</div>
          <div className="text-xs text-white/40">High</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{medium}</div>
          <div className="text-xs text-white/40">Medium</div>
        </div>
        <div className="glass-card p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{low}</div>
          <div className="text-xs text-white/40">Low</div>
        </div>
      </div>

      {/* Redacted Text */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-white/80 mb-3">Redacted Output</h3>
        <pre className="bg-black/30 rounded-xl p-4 text-sm text-white/70 font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
          {result.redactedText}
        </pre>
      </div>

      {/* Matches List */}
      {result.matches.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-white/80 mb-4">
            Sensitive Data Found ({result.matches.length})
          </h3>
          <div className="space-y-2">
            {result.matches.map((match, idx) => (
              <MatchCard
                key={idx}
                match={match}
                expanded={expandedMatches.has(idx)}
                onToggle={() => toggleMatch(idx)}
                originalText={result.originalText}
              />
            ))}
          </div>
        </div>
      )}

      {result.matches.length === 0 && (
        <div className="glass-card p-12 text-center">
          <Shield className="w-12 h-12 text-emerald-400/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white/60 mb-1">No sensitive data detected</h3>
          <p className="text-sm text-white/40">
            The text appears clean — no PII, secrets, or credentials were found.
          </p>
        </div>
      )}
    </div>
  );
}

function MatchCard({
  match,
  expanded,
  onToggle,
  originalText,
}: {
  match: GuardianMatch;
  expanded: boolean;
  onToggle: () => void;
  originalText: string;
}) {
  const config = RISK_CONFIG[match.risk_level];
  const Icon = config.icon;

  // Build context: show surrounding text
  const contextStart = Math.max(0, match.start - 30);
  const contextEnd = Math.min(originalText.length, match.end + 30);
  const before = originalText.slice(contextStart, match.start);
  const matched = originalText.slice(match.start, match.end);
  const after = originalText.slice(match.end, contextEnd);

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 hover:bg-white/3 transition-colors text-left"
      >
        <Icon className={`w-5 h-5 ${config.color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/80">{match.type}</span>
            <Badge className={`${config.bg} ${config.color} border-0 text-[10px]`}>
              {config.label}
            </Badge>
          </div>
          <p className="text-xs text-white/40 mt-0.5 truncate font-mono">
            {match.original.length > 40 ? match.original.slice(0, 40) + "..." : match.original}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-16">
            <Progress value={match.confidence} className="h-1.5" />
          </div>
          <span className="text-xs text-white/40 w-8">{match.confidence}%</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/30" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/6">
          <div className="flex items-center gap-2 mt-3">
            <Badge className={`${config.bg} ${config.color} border-0`}>
              {config.label} Risk
            </Badge>
            <span className="text-xs text-white/40">
              Position: {match.start}–{match.end}
            </span>
          </div>

          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">
              Context
            </div>
            <code className="text-xs text-white/60 font-mono break-all">
              {contextStart > 0 && "..."}
              {before}
              <span className={`${config.color} ${config.bg} px-1 rounded`}>
                {matched}
              </span>
              {after}
              {contextEnd < originalText.length && "..."}
            </code>
          </div>

          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">
              Original Value
            </div>
            <code className="text-xs text-amber-400 font-mono break-all bg-amber-500/10 px-2 py-1 rounded">
              {match.original}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
