"""
Stdin/stdout JSONL interface for Presidio PII scanning.
Spawned as a subprocess by the Tauri app.

Protocol:
  - On startup: prints {"ready": true}
  - Reads one JSON object per line from stdin
  - Writes one JSON response per line to stdout
  - Actions: "scan", "health", "quit"
"""

import json
import sys

from presidio_service import init_presidio, scan_for_pii, redact_text


def _calculate_exposure(matches, prompt_length):
    if not matches or prompt_length == 0:
        return 0
    risk_weights = {"critical": 30, "high": 15, "medium": 5, "low": 1}
    score = sum(risk_weights.get(m["risk_level"], 1) for m in matches)
    return min(100, score)


def respond(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    analyzer, anonymizer = init_presidio()
    respond({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            respond({"error": "invalid JSON"})
            continue

        action = req.get("action")

        if action == "quit":
            respond({"status": "bye"})
            break

        if action == "health":
            respond({"status": "ok"})
            continue

        if action == "scan":
            text = req.get("text", "")
            redaction_style = req.get("redaction_style", "replace")
            score_threshold = req.get("score_threshold", 0.4)

            try:
                matches = scan_for_pii(analyzer, text, score_threshold=score_threshold)

                # Re-run analyzer for anonymizer (it needs RecognizerResult objects)
                analyzer_results = analyzer.analyze(
                    text=text, language="en", score_threshold=score_threshold
                )
                redacted_text, _ = redact_text(
                    anonymizer, text, analyzer_results, redaction_style
                )

                exposure = _calculate_exposure(matches, len(text))

                respond({
                    "redacted_text": redacted_text,
                    "matches": matches,
                    "match_count": len(matches),
                    "data_exposure_score": exposure,
                    "redaction_style": redaction_style,
                })
            except Exception as e:
                respond({"error": str(e)})
            continue

        respond({"error": f"unknown action: {action}"})


if __name__ == "__main__":
    main()
