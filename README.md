<div align="center">

# Unalome Guardian

### Privacy data minimizer for AI prompts.

Redact before it leaks. Powered by Microsoft Presidio.

[Download](https://unalome.ai/unalome-guardian) · [Website](https://unalome.ai) · [Mission](https://unalome.ai/mission) · [Contributing](CONTRIBUTING.md)

</div>

---

## What is Unalome Guardian?

Unalome Guardian is a free, open-source desktop app that detects and redacts personally identifiable information (PII) and secrets from your AI prompts — before they leave your machine.

If you use ChatGPT, Claude, Gemini, or any AI service, you've probably pasted text containing email addresses, API keys, credit card numbers, or health data without realizing it. Guardian catches all of this and gives you a clean, redacted version to send instead.

Guardian wraps [Microsoft Presidio](https://github.com/microsoft/presidio)'s battle-tested PII detection engine in a consumer-friendly desktop interface. When Presidio isn't available, a built-in local regex scanner provides instant fallback protection.

**Built on Presidio. Not competing with Presidio. Contributing back.**

---

## Detection Categories

| Category | Data Types | Risk Level |
|----------|-----------|:----------:|
| Authentication | API keys (OpenAI, Anthropic, AWS, GitHub, Stripe), JWTs, Bearer tokens, private keys | Critical |
| Financial | Credit card numbers (with Luhn validation), US Social Security Numbers, bank accounts | Critical |
| Contact | Email addresses, phone numbers (US + international), IP addresses | High |
| Credentials | Passwords, environment variables, database connection strings | High |
| Health | Patient names with medical context, diagnoses, medications, PHI | High |
| Personal | Person names (NLP-detected), dates of birth, locations, addresses | Medium |

---

## Features

### Deep PII Detection

Powered by Microsoft Presidio's NLP engine for high-accuracy detection. Identifies emails, phone numbers, SSNs, credit cards, health data, names, dates, locations, and more. Goes beyond simple regex — uses named entity recognition and contextual analysis.

### Secret Scanner

Catches API keys (sk-, pk-, ghp_, pat_), JWTs, private keys (RSA/EC/DSA), connection strings, passwords, and environment variable assignments. Stops credential leaks before they happen.

### Three Redaction Styles

Choose how sensitive data is replaced:

- **Replace** — Substitutes with type tags: `<EMAIL_ADDRESS>`, `<CREDIT_CARD>`
- **Hash** — Replaces with partial hash, last 4 chars visible: `a8Kd...x9Lm`
- **Placeholder** — Simple `[REDACTED]` replacement

### Data Exposure Score

Dynamic 0–100 score based on match severity:

- Critical matches: +25 points each
- High: +15 points
- Medium: +8 points
- Low: +3 points

Color-coded feedback: green (<40), amber (40–69), red (≥70).

### Dual Engine Architecture

- **Microsoft Presidio** — NLP-powered analyzer for high accuracy when the Python backend is running
- **Local Scanner** — Built-in TypeScript regex scanner as instant fallback when Presidio is unavailable

Engine status is shown in the UI with a color-coded indicator. You're always protected.

### Risk Categorization

Every match is categorized as Critical, High, Medium, or Low risk. The results view shows a risk breakdown grid so you can see at a glance what needs immediate attention.

### Context-Aware Matches

Each match shows:

- Data type and confidence percentage
- Risk level badge
- Surrounding context (30 characters on each side)
- Original value with partial masking

### Scan History & Audit Trail

Every scan is persisted in local SQLite with full match details, exposure scores, engine type, and redaction style. Browse past scans, replay results, and maintain a complete audit trail. Aggregate stats show total scans, total matches, and risk breakdowns.

---

## How It Works

Unalome Guardian runs locally on your machine. It never sends your data anywhere. There is no cloud, no account, no telemetry.

1. **Paste your prompt** — paste the text you're about to send to an AI service
2. **Guardian scans for PII** — Presidio's NLP engine (or the local fallback) analyzes every word
3. **Review matches & risk** — see every detected item with risk level, confidence, and context
4. **Copy the safe version** — one click to copy the redacted text to your clipboard

---

## Tech Stack

**Frontend:** React 18, TypeScript, Tailwind CSS, Radix UI, Recharts, Lucide icons

**Backend:** Rust, Tauri 2, Tokio, SQLite (via rusqlite), Serde, UUID, Chrono

**PII Engine:** Microsoft Presidio (Python, optional) + built-in TypeScript regex scanner

**Storage:** Local SQLite database at platform-specific data directory

---

## Architecture

```
src/                         # React frontend
  components/
    GuardianInput.tsx        # Scan interface — text input, redaction style
    GuardianResults.tsx      # Results display — exposure score, matches
    GuardianHistory.tsx      # Scan history with replay
    ui/                      # Radix UI component wrappers
  lib/
    guardian/scanner.ts      # Local PII scanner (regex fallback)
  types/
    index.ts                 # TypeScript interfaces

src-tauri/                   # Rust backend
  src/
    main.rs                  # Tauri commands, Presidio subprocess management
    database.rs              # SQLite data layer
    setup.rs                 # Python venv & Presidio setup wizard

guardian_backend/            # Python backend (optional)
  presidio_cli.py            # JSONL stdin/stdout interface for Presidio
  presidio_service.py        # AnalyzerEngine & AnonymizerEngine wrappers
  requirements.txt           # presidio-analyzer, presidio-anonymizer
```

---

## Development

### Prerequisites

- Node.js 18+
- Rust 1.75+
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)
- Python 3.11+ (optional, for Presidio backend)

### Setup

```bash
npm install
npm run tauri dev
```

### Presidio Backend (optional)

For NLP-powered detection, install the Python dependencies:

```bash
cd guardian_backend
pip install -r requirements.txt
```

The app will automatically detect and use Presidio when available. Without it, the built-in regex scanner handles detection.

### Build

```bash
npm run tauri build
```

This produces a `.app` and `.dmg` in `src-tauri/target/release/bundle/`.

---

## Contributing

We welcome contributions of all kinds — code, documentation, design, translations, and ideas.

**Good first contributions:**

- Add PII patterns for your country (IBAN, CPF, national ID formats)
- Extend the local scanner with new detection patterns
- Build custom Presidio recognizers for AI-specific data types
- Add policy templates for industry-specific use cases
- Translate the interface to your language

We contribute AI-specific recognizers back to Microsoft Presidio upstream.

---

## Why Open Source?

The unalome symbol represents the path from confusion to clarity. We believe privacy tools must be transparent and auditable — you should be able to see exactly how your data is being protected.

---

## License

Apache 2.0 — free forever, for everyone.
