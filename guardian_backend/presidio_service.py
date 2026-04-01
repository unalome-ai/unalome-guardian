"""
Presidio PII detection service for Guardian.
Wraps Microsoft Presidio's analyzer and anonymizer engines.
"""

from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
from typing import List, Dict, Any, Optional, Tuple


def init_presidio() -> Tuple[AnalyzerEngine, AnonymizerEngine]:
    """Initialize Presidio engines."""
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()
    return analyzer, anonymizer


def scan_for_pii(
    analyzer: AnalyzerEngine,
    text: str,
    language: str = "en",
    entities: Optional[List[str]] = None,
    score_threshold: float = 0.4,
) -> List[Dict[str, Any]]:
    """
    Scan text for PII using Presidio.

    Returns list of matches with type, position, confidence, and original text.
    """
    results = analyzer.analyze(
        text=text,
        language=language,
        entities=entities,
        score_threshold=score_threshold,
    )

    matches = []
    for result in results:
        matches.append({
            "type": result.entity_type,
            "start": result.start,
            "end": result.end,
            "confidence": round(result.score * 100),
            "original": text[result.start:result.end],
            "risk_level": _get_risk_level(result.entity_type, result.score),
        })

    # Sort by position
    matches.sort(key=lambda m: m["start"])
    return matches


def redact_text(
    anonymizer: AnonymizerEngine,
    text: str,
    analyzer_results: List[RecognizerResult],
    style: str = "replace",
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Redact PII from text using specified style.

    Styles:
    - 'replace': Replace with [TYPE] (e.g., [EMAIL_ADDRESS])
    - 'hash': Replace with hash of original
    - 'placeholder': Replace with numbered placeholders (e.g., [EMAIL_1])
    """
    if style == "hash":
        operators = {"DEFAULT": OperatorConfig("hash", {"hash_type": "sha256"})}
    elif style == "placeholder":
        operators = {"DEFAULT": OperatorConfig("replace", {"new_value": "[REDACTED]"})}
    else:  # replace
        operators = None  # Default: replace with type name

    result = anonymizer.anonymize(
        text=text,
        analyzer_results=analyzer_results,
        operators=operators,
    )

    redaction_map = []
    for item in result.items:
        redaction_map.append({
            "type": item.entity_type,
            "start": item.start,
            "end": item.end,
            "original_start": item.start,
            "original_end": item.end,
            "operator": item.operator,
            "text": item.text,
        })

    return result.text, redaction_map


def _get_risk_level(entity_type: str, score: float) -> str:
    """Determine risk level based on entity type and confidence."""
    critical_types = {"CREDIT_CARD", "US_SSN", "US_BANK_NUMBER", "MEDICAL_LICENSE"}
    high_types = {"PHONE_NUMBER", "EMAIL_ADDRESS", "IP_ADDRESS", "US_DRIVER_LICENSE"}
    medium_types = {"PERSON", "LOCATION", "DATE_TIME", "NRP"}

    if entity_type in critical_types and score > 0.7:
        return "critical"
    if entity_type in high_types and score > 0.5:
        return "high"
    if entity_type in medium_types:
        return "medium"
    return "low"
