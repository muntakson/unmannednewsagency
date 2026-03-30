# Paperclip

AI agent orchestration platform — "If OpenClaw is an employee, Paperclip is the company."

## Quick Start

```bash
# Start server (tsx, not compiled)
pnpm --filter @paperclipai/server exec tsx src/index.ts

# Start ESP32 Times
cd esp32times && node server.js

# Start Approtech Times
COMPANY_ID=c372a25b-d2ad-483c-86a9-4f243592e557 node approtechnews/server.js
```

## Architecture

TypeScript monorepo:
- `server/` — Express.js API server (port 3100), embedded PostgreSQL (port 54329)
- `ui/` — React + Vite dashboard
- `cli/` — Command-line interface
- `packages/adapters/` — Agent runtime adapters (claude-local, codex-local, cursor-local, openclaw, ollama-local, groq, etc.)
- `packages/db/` — Drizzle ORM schema + migrations
- `packages/shared/` — Shared constants and types

### Key Files

| File | Purpose |
|---|---|
| `server/src/services/heartbeat.ts` | Heartbeat scheduler, agent run queue, wakeup logic |
| `server/src/routes/issues.ts` | Issue CRUD + assignment-based agent wakeup (line 382) |
| `server/src/routes/agents.ts` | Agent CRUD + manual wakeup endpoint |
| `server/src/adapters/registry.ts` | Maps adapter types to execution modules |
| `packages/adapters/groq/src/server/execute.ts` | Groq cloud API adapter with retry logic |
| `packages/adapters/ollama-local/src/server/tools.ts` | Tool definitions (Paperclip API + web tools) |

### Adapter Pattern

Each adapter implements `execute(ctx) -> AdapterExecutionResult`. Adapters use source `.ts` files directly (resolved by tsx at runtime, not compiled to dist).

### Heartbeat Service

- Scheduler runs every 30 seconds
- Three trigger types: timer (periodic), assignment (agent-to-agent), on_demand (manual)
- Per-agent run queue with concurrency lock (default max 1 concurrent run)
- Full stdout/stderr capture, token usage tracking

## ESP32 Times

Autonomous AI news site about ESP32 ecosystem at `esptimes.iotok.org`.

- Express server: `esp32times/server.js` (port 3200)
- Reads from Paperclip API — issues are articles
- Company ID: `2eee727c-7dbb-44b1-91dd-ba948c6d7e0a`
- 4 agents: Scout, Writer, Editor, CEO — all on Groq API (llama-3.3-70b-versatile)
- Heartbeat: 12 hours (twice daily)
- Admin dashboard at `/dashboard` for manual article creation
- Setup: `scripts/setup-esp32times.sh`
- Docs: `esp32times/HOW-IT-WORKS.md`, `esp32times/BOOK-CHAPTER.md` (also Korean: `BOOK-CHAPTER-KO.md`)

## Approtech Times (적정기술 타임즈)

Autonomous AI news site about appropriate technology at `appro.iotok.org`.

- Express server: `approtechnews/server.js` (port 3300)
- Reads from Paperclip API — issues are articles
- Company ID: `c372a25b-d2ad-483c-86a9-4f243592e557` (passed via env var, required)
- 4 agents: Scout, Writer, Editor, CEO — all on Groq API (llama-3.3-70b-versatile)
- Pipeline: Scout → Writer → done (Editor heartbeat disabled due to llama tool-call instability)
- Heartbeat: 12 hours (Scout + Writer active, Editor + CEO passive)
- Topics: water, energy, health, agriculture, AI for development, education, housing
- News sources (Korean): 적정기술학회, 나눔과기술, 국경없는과학자회
- News sources (International): Engineering for Change, Practical Action, MIT D-Lab, Appropriatetech.net, Appropedia, UNESCO, appropriate-technology.com
- News sources (Academic): Springer Journal of Appropriate Technology
- Setup: `scripts/setup-approtechnews.sh`
- Docs: `approtechnews/BOOK-CHAPTER-KO.md`
- Nginx reverse proxy: `appro.iotok.org` on 192.168.219.157 → 192.168.219.45:3300
- Green theme (--accent: #22c55e)

## Dashboard Article Creation — Lessons Learned

When creating articles via the `/dashboard`, input quality determines output quality:

| Input method | Result |
|---|---|
| Google search URL | **Bad** — `fetch_url` can't parse JS-rendered Google results pages |
| Direct article URL (e.g. `appropriatetech.net/index.php/12th-icat`) | **Good** — Scout extracts real content, creates detailed brief, triggers Writer |
| Short topic text (e.g. "12th ICAT Conference 2026") | **OK** — Scout uses `web_search` but results vary |
| Topic with embedded facts in issue description | **Best** — Writer uses facts directly, no hallucination |

Best practice: Paste a **direct article URL** (not Google) or provide key facts in the description. The full pipeline (Scout researches URL → creates Writer task → Writer writes → done) works reliably with direct URLs.

Scout has web tools (`web_search`, `fetch_url`); Writer does NOT — Writer only writes from whatever is in the issue description. So Scout's brief quality directly determines article quality.

## Common Pitfalls

- Kill ALL tsx/pnpm processes before restarting server (`pkill -f "tsx"`)
- Ollama tool calling requires `stream: false`
- Issue assignment field is `assigneeAgentId`, NOT `assigneeId`
- Heartbeat runs API: `GET /api/companies/:id/heartbeat-runs`
- Groq 429 rate limits: adapter retries up to 3 times with backoff
- When updating agent config, read full config first to avoid overwriting API keys
- Groq llama-3.3-70b Editor agent fails on tool calls (outputs `"none"` params) — skip Editor, have Writer set status to `done` directly
- Update agents via `PATCH /api/agents/:id` (no company prefix in route)
- Facebook pages are hard to scrape with fetch_url — content extraction is limited
