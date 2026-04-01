export type RiskLevel = "critical" | "high" | "medium" | "low";
export type RedactionStyle = "replace" | "hash" | "placeholder";
export type ScanEngine = "presidio" | "local";

export interface GuardianMatch {
  type: string;
  start: number;
  end: number;
  confidence: number;
  original: string;
  risk_level: RiskLevel;
}

export interface GuardianResult {
  scanId: string;
  originalText: string;
  redactedText: string;
  matches: GuardianMatch[];
  matchCount: number;
  dataExposureScore: number;
  redactionStyle: RedactionStyle;
  engine: ScanEngine;
  scannedAt: number;
}

export interface GuardianScan {
  id: string;
  timestamp: number;
  text_preview: string;
  match_count: number;
  exposure_score: number;
  engine: string;
  redaction_style: string;
  full_result_json: string;
}

export interface GuardianStats {
  total_scans: number;
  total_matches: number;
  avg_exposure: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}
