/**
 * Local TypeScript PII scanner — fallback when Presidio backend is unavailable.
 * Uses regex patterns to detect common PII types.
 */

import type { GuardianMatch, GuardianResult, RedactionStyle, RiskLevel } from "@/types";

interface PatternDef {
  type: string;
  pattern: RegExp;
  risk: RiskLevel;
  confidence: number;
}

const PATTERNS: PatternDef[] = [
  // Critical
  { type: "CREDIT_CARD", pattern: /\b(?:\d[ -]*?){13,16}\b/g, risk: "critical", confidence: 85 },
  { type: "US_SSN", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, risk: "critical", confidence: 95 },
  // High
  { type: "EMAIL_ADDRESS", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, risk: "high", confidence: 95 },
  { type: "PHONE_NUMBER", pattern: /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g, risk: "high", confidence: 80 },
  { type: "IP_ADDRESS", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, risk: "high", confidence: 90 },
  // Medium
  { type: "DATE_TIME", pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, risk: "medium", confidence: 70 },
  // API keys & secrets
  { type: "API_KEY", pattern: /\b(?:sk|pk|api[_-]?key)[_-][A-Za-z0-9]{20,}\b/gi, risk: "critical", confidence: 90 },
  { type: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, risk: "critical", confidence: 95 },
  { type: "PRIVATE_KEY", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, risk: "critical", confidence: 99 },
  { type: "CONNECTION_STRING", pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+/gi, risk: "critical", confidence: 90 },
  { type: "PASSWORD", pattern: /(?:password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{4,}/gi, risk: "high", confidence: 80 },
  { type: "ENV_VARIABLE", pattern: /\b[A-Z_]{2,}(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_API)\s*=\s*[^\s]+/g, risk: "high", confidence: 85 },
];

function getRiskLevel(type: string, confidence: number): RiskLevel {
  const critical = new Set(["CREDIT_CARD", "US_SSN", "API_KEY", "JWT", "PRIVATE_KEY", "CONNECTION_STRING"]);
  const high = new Set(["EMAIL_ADDRESS", "PHONE_NUMBER", "IP_ADDRESS", "PASSWORD", "ENV_VARIABLE"]);
  const medium = new Set(["DATE_TIME", "PERSON", "LOCATION"]);

  if (critical.has(type) && confidence > 70) return "critical";
  if (high.has(type) && confidence > 50) return "high";
  if (medium.has(type)) return "medium";
  return "low";
}

export function scanText(text: string): GuardianMatch[] {
  const matches: GuardianMatch[] = [];
  const seen = new Set<string>();

  for (const def of PATTERNS) {
    const regex = new RegExp(def.pattern.source, def.pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const key = `${match.index}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);

      matches.push({
        type: def.type,
        start: match.index,
        end: match.index + match[0].length,
        confidence: def.confidence,
        original: match[0],
        risk_level: getRiskLevel(def.type, def.confidence),
      });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}

export function redactText(
  text: string,
  matches: GuardianMatch[],
  style: RedactionStyle
): string {
  if (matches.length === 0) return text;

  // Process from end to start to preserve positions
  const sorted = [...matches].sort((a, b) => b.start - a.start);
  let result = text;

  for (const m of sorted) {
    let replacement: string;
    switch (style) {
      case "hash":
        replacement = "***" + m.original.slice(-4);
        break;
      case "placeholder":
        replacement = "[REDACTED]";
        break;
      default: // replace
        replacement = `<${m.type}>`;
    }
    result = result.slice(0, m.start) + replacement + result.slice(m.end);
  }

  return result;
}

export function calculateExposure(matches: GuardianMatch[], textLength: number): number {
  if (matches.length === 0 || textLength === 0) return 0;
  const weights: Record<RiskLevel, number> = { critical: 30, high: 15, medium: 5, low: 1 };
  const score = matches.reduce((sum, m) => sum + (weights[m.risk_level] || 1), 0);
  return Math.min(100, score);
}

export async function scanWithPresidioBackend(
  text: string,
  redactionStyle: RedactionStyle
): Promise<GuardianResult | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<{
      redacted_text: string;
      matches: GuardianMatch[];
      match_count: number;
      data_exposure_score: number;
    }>("scan_with_presidio", {
      text,
      redactionStyle: redactionStyle,
      scoreThreshold: 0.4,
    });

    const scanId = crypto.randomUUID();

    return {
      scanId,
      originalText: text,
      redactedText: data.redacted_text,
      matches: data.matches,
      matchCount: data.match_count,
      dataExposureScore: data.data_exposure_score,
      redactionStyle,
      engine: "presidio",
      scannedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export function scanLocal(
  text: string,
  redactionStyle: RedactionStyle
): GuardianResult {
  const matches = scanText(text);
  const redacted = redactText(text, matches, redactionStyle);
  const exposure = calculateExposure(matches, text.length);
  const scanId = crypto.randomUUID();

  return {
    scanId,
    originalText: text,
    redactedText: redacted,
    matches,
    matchCount: matches.length,
    dataExposureScore: exposure,
    redactionStyle,
    engine: "local",
    scannedAt: Date.now(),
  };
}
