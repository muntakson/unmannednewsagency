# Building an Autonomous AI News Agency with Paperclip

## A Technical Deep Dive into ESP32 Times

---

## Table of Contents

1. [The Rise of Autonomous AI Agents](#1-the-rise-of-autonomous-ai-agents)
2. [OpenClaw: The Individual Agent](#2-openclaw-the-individual-agent)
3. [Paperclip: The Company Orchestrator](#3-paperclip-the-company-orchestrator)
4. [How Paperclip Works Internally](#4-how-paperclip-works-internally)
5. [What is ESP32 Times?](#5-what-is-esp32-times)
6. [Why Paperclip for a Non-Manned News Agency](#6-why-paperclip-for-a-non-manned-news-agency)
7. [How ESP32 Times Works](#7-how-esp32-times-works)
8. [Internal Structure of the ESP32 Times Codebase](#8-internal-structure-of-the-esp32-times-codebase)
9. [Manual Article Creation: The Admin Dashboard](#9-manual-article-creation-the-admin-dashboard)
10. [Autonomous Operation: Heartbeats, Queues, and Cascades](#10-autonomous-operation-heartbeats-queues-and-cascades)
11. [Lessons Learned](#11-lessons-learned)

---

## 1. The Rise of Autonomous AI Agents

The history of autonomous AI agents stretches from early rule-based systems (ELIZA, 1966; expert systems, 1970s-80s) through the planning-capable agents of the 2000s (STRIPS, HTN planners) to the modern era of large language model-powered agents.

The breakthrough came in 2023-2024 when LLMs gained the ability to use tools. Instead of merely generating text, agents could now call functions, browse the web, write code, and interact with APIs. Projects like AutoGPT (March 2023) demonstrated that an LLM could set goals, break them into tasks, and execute them in a loop. BabyAGI showed that task queues could drive autonomous behavior. CrewAI formalized the concept of multi-agent teams with roles.

But these early frameworks had a critical limitation: they operated as single-session scripts. When the process died, the agent's state was lost. There was no persistent task management, no organizational hierarchy, no cost control, and no way for a human to supervise without babysitting a terminal.

This is the gap that tools like OpenClaw and Paperclip address — but at fundamentally different levels of abstraction.

## 2. OpenClaw: The Individual Agent

OpenClaw is an open-source autonomous coding agent. Think of it as a single, highly capable employee. It can:

- Receive a task (via CLI or webhook)
- Plan an approach
- Write and execute code
- Use tools (file system, shell, APIs)
- Iterate until the task is done

OpenClaw excels at **individual execution**. Give it a well-defined task — "implement user authentication for this Express app" — and it will plan, code, test, and deliver. It operates within a single session, with a single context window, focused on a single objective.

**How OpenClaw integrates with Paperclip:**

In Paperclip's architecture, OpenClaw is one of many possible *adapters*. When Paperclip needs to wake an OpenClaw agent, it sends an HTTP webhook:

```
Paperclip Server
  |  POST https://openclaw-endpoint/webhook
  |  Body: { paperclip: { runId, agentId, issueId, context... } }
  v
OpenClaw receives the wake signal
  |  Reads the task context
  |  Executes the work
  |  Reports results back
```

The OpenClaw adapter in Paperclip (`packages/adapters/openclaw/`) is essentially an HTTP client that delivers wake payloads and collects responses. It does not run OpenClaw locally — it triggers a remote OpenClaw instance via webhook.

**OpenClaw's limitation for our use case:** OpenClaw is designed for code-centric tasks. It doesn't natively understand organizational structures, editorial workflows, or multi-agent coordination. It's an excellent employee, but it cannot run a newsroom by itself.

## 3. Paperclip: The Company Orchestrator

Paperclip's tagline captures its essence: **"If OpenClaw is an employee, Paperclip is the company."**

Paperclip is a Node.js server and React UI that orchestrates a team of AI agents to run a business. It provides:

| Capability | Description |
|---|---|
| **Org Charts** | Hierarchies, roles, reporting lines. Agents have a boss, a title, and a job description. |
| **Issue Tracking** | A ticket system where every task has a status, assignee, priority, and full history. |
| **Heartbeat Scheduler** | Agents wake on configurable intervals to check for work and act autonomously. |
| **Goal Alignment** | Every task traces back to the company mission. Agents know *what* to do and *why*. |
| **Cost Control** | Monthly budgets per agent. Token usage tracking and spend limits. |
| **Governance** | Approval gates, config versioning, pause/terminate controls. |
| **Multi-Company** | One deployment runs many companies with complete data isolation. |
| **Adapter System** | Bring any agent runtime — Claude Code, Codex, Cursor, OpenClaw, Ollama, Groq, Bash, HTTP. |

### The Key Insight: Separation of Orchestration from Execution

Paperclip does not contain an LLM. It does not generate text or write code. Instead, it provides the **organizational infrastructure** that agents need to function as a team:

```
   Paperclip (Orchestrator)
   +-----------------------+
   | Org Chart             |    Agents (Executors)
   | Issue Tracker         |    +------------------+
   | Heartbeat Scheduler --+--->| Claude Code      |
   | Budget Manager        |    | Codex            |
   | Audit Log             |    | OpenClaw         |
   | API Gateway           |    | Groq + Llama 3.3 |
   | Web Dashboard         |    | Cursor           |
   +-----------------------+    | Any HTTP endpoint|
                                +------------------+
```

This separation means you can swap agent runtimes without changing the orchestration. ESP32 Times started with local Ollama (llama3.1), switched to Groq API (llama-3.3-70b-versatile), and the organizational structure, task history, and workflow logic remained completely unchanged.

## 4. How Paperclip Works Internally

### Architecture

Paperclip is a TypeScript monorepo with four main components:

```
paperclip/
  server/          -- Express.js API server (port 3100)
  ui/              -- React + Vite dashboard
  cli/             -- Command-line interface
  packages/
    adapters/      -- Agent runtime adapters
      claude-local/    -- Claude Code (local CLI)
      codex-local/     -- OpenAI Codex (local CLI)
      cursor-local/    -- Cursor (local CLI)
      opencode-local/  -- OpenCode (local CLI)
      openclaw/        -- OpenClaw (HTTP webhook)
      ollama-local/    -- Ollama (local HTTP API)
      groq/            -- Groq cloud API
    adapter-utils/     -- Shared adapter utilities
    db/                -- Drizzle ORM schema + migrations
    shared/            -- Shared constants and types
```

### The Server

The Paperclip server (`server/src/`) is an Express.js application with:

- **Routes** (`routes/`): REST API endpoints for issues, agents, companies, goals, costs, health checks
- **Services** (`services/`): Business logic for heartbeat scheduling, issue management, activity logging, cost tracking
- **Adapters** (`adapters/`): Registry that maps adapter types to execution modules
- **Database**: Embedded PostgreSQL (port 54329) with Drizzle ORM

### The Adapter Pattern

Each adapter implements a standard interface:

```typescript
interface AdapterModule {
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(config): Promise<TestResult>;
}
```

The `execute` function receives a context containing:
- `runId` — unique run identifier
- `agent` — the agent's config, role, company
- `config` — adapter-specific config (API keys, model, system prompt)
- `context` — wake context (which issue triggered this, why)
- `onLog(stream, data)` — callback for stdout/stderr logging
- `onMeta(info)` — callback for metadata (model used, tokens, etc.)

And returns:
- `exitCode`, `signal`, `timedOut`
- `usage` — token counts
- `summary` — text summary of what the agent did
- `resultJson` — structured output (full stdout capture)

### The Heartbeat Service

The heartbeat service (`server/src/services/heartbeat.ts`, 2,325 lines) is the engine of autonomous operation. It manages:

1. **Timer-based waking**: A scheduler runs every 30 seconds (`HEARTBEAT_SCHEDULER_INTERVAL_MS`). For each agent, it checks if `intervalSec` has elapsed since `lastHeartbeatAt`. If so, it enqueues a wake.

2. **Assignment-based waking**: When an issue is created or reassigned (in `routes/issues.ts`), the server immediately calls `heartbeat.wakeup(assigneeAgentId, { source: "assignment" })`. This is how agents trigger each other.

3. **On-demand waking**: External systems (dashboard, API clients) call `POST /api/agents/:id/wakeup` to immediately wake an agent.

4. **Run queue**: Wakeup requests are queued. The scheduler processes them sequentially per agent (configurable concurrency, default 1). This prevents duplicate runs.

5. **Run lifecycle**: Each run transitions through `queued -> running -> succeeded/failed/cancelled`. The full stdout/stderr is captured, token usage is tracked, and results are stored in the database.

```
Heartbeat Scheduler (every 30s)
  |
  for each agent:
  |  if (now - lastHeartbeatAt > intervalSec):
  |    enqueueWakeup(agentId, source="timer")
  |
  for each queued wakeup:
  |  if (agent not already running):
  |    adapter = getAdapter(agent.adapterType)
  |    result = await adapter.execute(context)
  |    store result in database
  |    update agent status
```

## 5. What is ESP32 Times?

ESP32 Times is a fully autonomous, AI-powered news website covering the ESP32 microcontroller ecosystem. It publishes at `esptimes.iotok.org`.

What makes it remarkable is that **no human writes, edits, or publishes the articles**. The entire editorial process — from discovering news stories to writing articles to publishing them on the web — is performed by a team of four AI agents coordinated by Paperclip.

The site covers:
- New ESP32 hardware (ESP32-S3, ESP32-C6, ESP32-P4)
- Framework updates (ESP-IDF, Arduino, MicroPython, ESPHome)
- Community projects from Hackaday, Reddit, Hackster.io
- Tutorials and getting-started guides
- Security advisories

Each article includes:
- A hero image sourced from the original article's `og:image` meta tag
- Image credit linking to the source
- A source attribution box linking to the original article
- Token usage and cost transparency (e.g., "Groq: 51.9k tokens - $0.03")

## 6. Why Paperclip for a Non-Manned News Agency

A news agency has a natural organizational structure that maps perfectly to Paperclip's model:

| News Agency Role | Paperclip Concept | ESP32 Times Agent |
|---|---|---|
| Editor-in-Chief | CEO agent with org chart authority | CEO |
| Beat Reporter | Engineer agent with research tools | Scout |
| Staff Writer | Engineer agent with writing skills | Writer |
| Copy Editor | Engineer agent with review skills | Editor |
| Editorial Calendar | Issue tracker with priorities | Paperclip Issues |
| Publication Schedule | Heartbeat intervals | 12-hour timer |
| Published Articles | Done issues with descriptions | Done status |
| Assignment Desk | Issue assignment + auto-wake | Assignment trigger |

Without Paperclip, building this would require:
- Custom task queue and scheduler
- Custom agent state management
- Custom inter-agent communication protocol
- Custom logging and cost tracking
- Custom admin dashboard

Paperclip provides all of this out of the box. The ESP32 Times application itself is only ~900 lines of code (the Express server that renders the website). All the orchestration, scheduling, agent coordination, and state management is handled by Paperclip.

### The Economics

ESP32 Times runs on Groq's API with the `llama-3.3-70b-versatile` model. Typical costs per article:

| Stage | Tokens | Cost |
|---|---|---|
| Scout research (web search + fetch) | ~30-50k | $0.02-0.03 |
| Writer article generation | ~15-25k | $0.01-0.02 |
| Total per article | ~45-75k | $0.03-0.05 |

At two heartbeat cycles per day and ~2-3 articles per cycle, the daily operating cost is approximately $0.10-0.30. This makes it economically viable to run a fully autonomous news site indefinitely.

## 7. How ESP32 Times Works

### The Agent Team

ESP32 Times operates with four agents, each configured in Paperclip with a specific role, system prompt, and adapter:

**Scout (News Scout)**
- Adapter: Groq (llama-3.3-70b-versatile)
- Role: `engineer`
- Reports to: CEO
- Heartbeat: 12 hours
- Tools: `list_my_issues`, `update_issue`, `create_issue`, `list_agents`, `web_search`, `fetch_url`
- Mission: Search the web for ESP32 news, write story briefs, assign articles to Writer

**Writer (Technical Writer)**
- Adapter: Groq (llama-3.3-70b-versatile)
- Role: `engineer`
- Reports to: CEO
- Heartbeat: 12 hours
- Tools: `list_my_issues`, `update_issue`, `create_issue`, `list_agents`
- Mission: Transform story briefs into full, professional articles

**Editor (Content Editor)**
- Adapter: Groq (llama-3.3-70b-versatile)
- Role: `engineer`
- Reports to: CEO
- Heartbeat: 12 hours
- Tools: Same as Writer
- Mission: Review articles for quality and accuracy

**CEO (Chief Editor)**
- Adapter: Groq (llama-3.3-70b-versatile)
- Role: `ceo`
- Heartbeat: 12 hours
- Tools: Same as Writer
- Mission: Set editorial priorities, coordinate the team

### The Tool System

Agents interact with both the Paperclip API and the real web through a unified tool system defined in `packages/adapters/ollama-local/src/server/tools.ts`:

**Paperclip API Tools:**

| Tool | Purpose |
|---|---|
| `list_my_issues` | List all issues assigned to the calling agent |
| `list_company_issues` | List all issues in the company |
| `get_issue` | Get details of a specific issue |
| `update_issue` | Change status, description, or other fields |
| `create_issue` | Create a new issue (optionally assigned to another agent) |
| `add_comment` | Add a comment to an issue |
| `list_agents` | List all agents in the company (to find IDs for assignment) |

**Web Tools:**

| Tool | Purpose |
|---|---|
| `web_search` | Aggregate RSS feeds from Hackaday and Reddit r/esp32, filter by query keywords |
| `fetch_url` | Fetch any URL — extract text content, page title, `og:image`, and source attribution |

The `web_search` tool works by fetching three RSS sources in parallel:
1. Hackaday ESP32 tag RSS (`https://hackaday.com/tag/esp32/feed/`)
2. Hackaday front page RSS (`https://hackaday.com/feed/`)
3. Reddit r/esp32 JSON API (`https://www.reddit.com/r/esp32.json`)

Results are filtered by query keywords and returned as structured data with titles, links, and descriptions.

The `fetch_url` tool handles both RSS/Atom feeds and HTML pages. For HTML pages, it:
1. Extracts `og:image` and `twitter:image` meta tags
2. Strips scripts, styles, nav, footer
3. Extracts main content text
4. Returns structured data with a `source_note` prompting the agent to include attribution

### The Article Pipeline

```
Discovery        Research         Writing          Review           Publication
---------        --------         -------          ------           -----------
web_search  -->  fetch_url  -->   update_issue --> update_issue --> Appears on
finds topic      reads article    writes full      sets status      esptimes.iotok.org
                 extracts image   article into     to "in_review"
                                  description      or "done"
```

Each stage is tracked as an issue status transition:

```
todo --> in_progress --> in_review --> done
```

## 8. Internal Structure of the ESP32 Times Codebase

ESP32 Times is a standalone Express.js application that reads from the Paperclip API:

```
esp32times/
  server.js            -- Main Express server (909 lines)
  public/
    styles.css         -- Dark theme CSS (783 lines)
  package.json         -- Dependencies: express, marked
  HOW-IT-WORKS.md      -- Operational documentation
```

### server.js Structure

The server is organized into these sections:

**1. Data Fetching (lines 1-57)**

```javascript
const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const COMPANY_ID = "2eee727c-7dbb-44b1-91dd-ba948c6d7e0a";

async function fetchIssues(status) { /* GET /api/companies/:id/issues */ }
async function fetchIssue(id) { /* GET /api/issues/:id */ }
async function fetchAgents() { /* GET /api/companies/:id/agents */ }
async function getArticles() { /* combines done + in_review + in_progress */ }
```

ESP32 Times does not have its own database. It reads directly from the Paperclip API. Issues *are* articles. The issue title becomes the article headline. The issue description (Markdown) becomes the article body. The issue status determines whether it's a draft or published.

**2. Content Extraction Utilities (lines 58-200)**

```javascript
function extractImage(desc) { /* finds ![alt](url) or raw image URLs */ }
function extractSource(desc) { /* finds Source: [title](url) patterns */ }
function extractImageCredit(desc) { /* finds *Image: [domain](url)* */ }
function cleanIssueTitle(title) { /* strips "Write article on", "Scout:", etc. */ }
function extractSummary(desc, maxLen) { /* strips markdown for card previews */ }
function getCategory(issue) { /* categorizes: News, Tutorial, Review, Project, Update, Security */ }
function articleCard(issue, featured, tokenUsage) { /* renders article card HTML */ }
```

**3. Token Usage Tracking (lines 160-200)**

```javascript
async function fetchTokenUsageByIssue() {
  // Fetches heartbeat runs from Paperclip API
  // Parses stdout to find which issue IDs each run worked on
  // Aggregates inputTokens + outputTokens per issue
}

// Groq pricing: $0.59/M input, $0.79/M output
function formatTokenCost(tokenInfo) {
  // Returns "Groq: 51.9k tokens - $0.03"
}
```

**4. Public Routes**

| Route | Purpose |
|---|---|
| `GET /` | Home page — hero section, featured article, article grid |
| `GET /news` | All articles page with full grid |
| `GET /article/:id` | Article detail — hero image, body, source, tokens |
| `GET /status` | Newsroom status — agent cards, content pipeline board |
| `GET /about` | About page describing the AI newsroom |
| `GET /dashboard` | Admin dashboard (see Section 9) |

**5. Admin API Proxies**

```javascript
POST /dashboard/api/issues          // Create new issue
POST /dashboard/api/issues/:id/status  // Change issue status
POST /dashboard/api/agents/:id/wakeup  // Wake an agent
```

These proxy endpoints exist because the browser cannot directly reach the Paperclip API (it runs on localhost:3100, while the site is accessed via the public domain). The ESP32 Times server acts as a bridge.

**6. Layout and Rendering**

All pages are server-side rendered. The `layout()` function wraps content in a consistent HTML shell with:
- Google Fonts (Inter, JetBrains Mono)
- Navigation bar with active state
- Footer with Paperclip attribution
- Cache-busted CSS (`styles.css?v=7`)

Article descriptions are rendered from Markdown to HTML using the `marked` library. Before rendering, the server strips `Source:` lines and `![image]()` markdown (since these are displayed separately as structured elements).

### styles.css Structure

The CSS uses CSS custom properties for theming:

```css
:root {
  --bg: #0a0a0b;
  --bg-card: #141416;
  --border: #2a2a2e;
  --text: #e4e4e7;
  --accent: #3b82f6;
  /* ... */
}
```

Sections: base reset, header/nav, hero, article cards (with image support), article detail (hero image, image credit, source box), newsroom status (agent cards, pipeline board), admin dashboard (alert banners, agent cards, issue table, create form, toast notifications).

## 9. Manual Article Creation: The Admin Dashboard

The admin dashboard at `/dashboard` allows a human editor to command the AI newsroom directly.

### Creating an Article

The dashboard includes a "Create Article" form with three controls:

1. **Topic input** — free text field (e.g., "OpenMQTTGateway")
2. **Mode selector**:
   - "Scout researches then Writer writes" — full pipeline
   - "Writer writes directly" — skip research phase
3. **Priority** — High / Medium / Low

### What Happens When You Click "Create"

**Mode: Scout researches then Writer writes**

```
Admin enters "OpenMQTTGateway" and clicks Create
  |
  |  1. JavaScript sends POST /dashboard/api/issues
  |     Body: {
  |       title: "Scout: Research OpenMQTTGateway",
  |       description: "Research this topic and create a detailed story brief...",
  |       assigneeAgentId: "1054dee8-...",  // Scout's ID
  |       priority: "medium",
  |       status: "todo"
  |     }
  |
  |  2. Paperclip API creates the issue in the database
  |     The issues.ts route handler detects assigneeAgentId is set
  |     It calls heartbeat.wakeup(scoutId, { source: "assignment" })
  |
  |  3. JavaScript sends POST /dashboard/api/agents/scout/wakeup
  |     This is a redundant safety wakeup (belt and suspenders)
  |
  |  4. Dashboard shows toast: "Created research task & woke Scout"
  |     Page reloads after 2 seconds
  v
Scout wakes up within seconds (invocationSource: "assignment")
```

**Mode: Writer writes directly**

```
Admin clicks Create with "Writer writes directly" selected
  |
  |  Creates issue "Write article on OpenMQTTGateway"
  |  Assigned directly to Writer
  |  Wakes Writer immediately
  v
Writer wakes up, writes article without Scout research phase
```

### Other Dashboard Actions

- **Wake Agent** — Immediately wakes any agent via `POST /api/agents/:id/wakeup`
- **Wake All Agents** — Wakes all four agents sequentially
- **Change Issue Status** — Move any issue to todo/in_progress/in_review/done/cancelled via dropdown
- **Stuck Issue Detection** — Banner showing issues in progress/review with no active agent run

## 10. Autonomous Operation: Heartbeats, Queues, and Cascades

This is the core of ESP32 Times' autonomous operation. No human needs to be present. The system runs indefinitely on its own.

### The Three Trigger Mechanisms

| Trigger | Source | Speed | Use Case |
|---|---|---|---|
| **Heartbeat Timer** | `heartbeat_scheduler` | Every `intervalSec` | Periodic autonomous work |
| **Assignment Detection** | `issues.ts` route | Immediate (~30s) | Agent-to-agent delegation |
| **Manual Wakeup** | Dashboard / API | Immediate | Human-directed tasks |

### Trigger 1: Heartbeat Timer

The Paperclip server runs a scheduler function (`tickTimers`) every 30 seconds:

```typescript
// server/src/services/heartbeat.ts, line 2203
tickTimers: async (now = new Date()) => {
  const allAgents = await db.select().from(agents);
  for (const agent of allAgents) {
    // Skip paused/terminated agents
    if (agent.status === "paused" || agent.status === "terminated") continue;

    const policy = parseHeartbeatPolicy(agent);
    if (!policy.enabled || policy.intervalSec <= 0) continue;

    // Check if enough time has elapsed
    const baseline = new Date(agent.lastHeartbeatAt ?? agent.createdAt).getTime();
    const elapsedMs = now.getTime() - baseline;
    if (elapsedMs < policy.intervalSec * 1000) continue;

    // Enqueue a wake
    await enqueueWakeup(agent.id, {
      source: "timer",
      triggerDetail: "system",
      reason: "heartbeat_timer",
    });
  }
}
```

When Scout's 12-hour timer fires:

```
Heartbeat Timer fires for Scout
  |
  v
Scout's Groq adapter execute() runs:
  1. Pre-fetch: list_my_issues() -- may have tasks from CEO or be empty
  2. System prompt says: "Always start by calling web_search"
  3. tool_choice: "required" on first turn -- forces a tool call
  4. web_search("ESP32 new project 2026")
     |  Fetches Hackaday RSS, Reddit r/esp32 JSON
     |  Returns: [{title: "AI Assistant Uses ESP32", link: "https://...", ...}]
  5. fetch_url("https://hackaday.com/2026/02/27/ai-assistant-uses-esp32/")
     |  Returns: {title, content, image: "og:image URL", source_note: "..."}
  6. create_issue("Write article on AI Assistant Uses ESP32", assignee=Writer)
     |  This triggers Assignment Detection (see below)
  7. Scout marks its own task as done
```

**How does Scout choose topics autonomously?** Scout's system prompt contains permanent standing instructions listing specific search queries to try and sources to check. When it wakes with no assigned tasks, it follows these instructions and searches for whatever is currently trending in the ESP32 RSS feeds. The `web_search` tool aggregates live data from Hackaday and Reddit, so topics are always current and real.

### Trigger 2: Assignment Detection

When Scout calls `create_issue` with `assigneeAgentId = Writer`, the Paperclip API's issue creation handler fires:

```typescript
// server/src/routes/issues.ts, line 382
if (issue.assigneeAgentId) {
  void heartbeat.wakeup(issue.assigneeAgentId, {
    source: "assignment",
    triggerDetail: "system",
    reason: "issue_assigned",
    payload: { issueId: issue.id, mutation: "create" },
  });
}
```

This immediately enqueues a wakeup for Writer. Writer doesn't need to wait for its 12-hour heartbeat — it wakes within seconds.

```
Scout calls create_issue(assignee=Writer)
  |
  v
Paperclip API creates the issue
  |  issues.ts detects assigneeAgentId is set
  |  Calls heartbeat.wakeup(writerId, source="assignment")
  v
Heartbeat service enqueues wakeup for Writer
  |  Next scheduler tick (within 30s) processes the queue
  v
Writer's Groq adapter execute() runs:
  1. list_my_issues() -- sees the new "todo" task
  2. update_issue(status="in_progress")
  3. Reads the story brief Scout wrote
  4. Writes a full article into the description
  5. update_issue(status="in_review")
  v
Article appears on esptimes.iotok.org
```

### Trigger 3: Manual Wakeup

The dashboard calls `POST /api/agents/:id/wakeup`:

```typescript
// The wakeup endpoint enqueues with source="on_demand"
heartbeat.wakeup(agentId, {
  source: "on_demand",    // not timer, not assignment
  triggerDetail: "manual", // valid values: manual, ping, callback, system
});
```

### The Full Autonomous Cascade

Here is the complete cascade that runs twice daily without any human involvement:

```
Hour 0: Heartbeat fires for Scout
  |
  SCOUT (invocationSource: "heartbeat", triggerDetail: "system")
  |  web_search("ESP32 new project 2026") --> finds 3 interesting articles
  |  fetch_url(article1_url) --> reads content, gets og:image
  |  fetch_url(article2_url) --> reads content, gets og:image
  |  create_issue("Write article on Topic A", assignee=Writer)  --+
  |  create_issue("Write article on Topic B", assignee=Writer)  --+
  |  Done.                                                         |
  |                                                                |
  +--- ~30 seconds later (assignment detection) -------------------+
  |
  WRITER (invocationSource: "assignment", triggerDetail: "system")
  |  list_my_issues() --> sees 2 new "todo" tasks
  |  Picks up "Topic A"
  |  update_issue(status="in_progress")
  |  Writes full article (800-1200 words)
  |  update_issue(description="full article with image and source")
  |  update_issue(status="in_review")
  |  Done.
  |
  +--- Next heartbeat or assignment ---
  |
  WRITER wakes again for "Topic B"
  |  Same process
  |  Done.
  |
  +--- Editor heartbeat fires ---
  |
  EDITOR (invocationSource: "heartbeat")
  |  Checks for "in_review" articles
  |  Reviews and moves to "done"
  |  Done.
  |
  v
Articles are published on esptimes.iotok.org
```

### The Run Queue

Paperclip ensures agents don't run multiple times simultaneously through a queue system:

1. Each wakeup request is stored in the `agentWakeupRequests` table
2. The scheduler processes requests FIFO
3. A per-agent lock (`startLocksByAgent`) prevents concurrent execution
4. Default max concurrent runs per agent: 1
5. If an agent is already running when a new wakeup arrives, the request stays queued

### Rate Limiting and Retry

The Groq adapter includes retry logic for API rate limits:

```typescript
// packages/adapters/groq/src/server/execute.ts
for (let attempt = 0; attempt < 3; attempt++) {
  const res = await fetch(groqEndpoint, { ... });
  if (res.status === 429 && attempt < 2) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "", 10);
    const waitMs = (retryAfter > 0 ? retryAfter : (attempt + 1) * 5) * 1000;
    await new Promise(r => setTimeout(r, waitMs));
    continue;
  }
  break;
}
```

Additionally, agent heartbeats are staggered (Scout: 12h, Writer: 12h, Editor: 12h, CEO: 12h) to prevent all agents from firing simultaneously and hitting rate limits.

### Tool Call Reliability

The Groq adapter uses two strategies to ensure reliable tool calling:

1. **`tool_choice: "required"` on the first turn** — Forces the LLM to produce a structured tool call rather than text output. On subsequent turns, `tool_choice: "auto"` allows the model to choose between tools and text.

2. **Text fallback parser** — If the model outputs tool calls as text (e.g., `<function(update_issue)>{"issue_id": "..."}`), the adapter parses these patterns and executes them as real tool calls:

```typescript
const textToolPattern = /<function(?:=|\()(\w+)\)?>\s*(\{[\s\S]*?\})/g;
while ((match = textToolPattern.exec(assistantContent)) !== null) {
  toolCalls.push({
    id: `text_tc_${turn}_${callId++}`,
    type: "function",
    function: { name: match[1], arguments: match[2] },
  });
}
```

### Conversation Loop

Each agent run is a multi-turn conversation loop (up to 15 turns):

```
Turn 0: System prompt + user prompt + pre-fetched tasks
        tool_choice: "required" --> forces first tool call
Turn 1: Tool result + assistant response
        tool_choice: "auto" --> model decides
Turn 2: More tool calls or final text response
...
Turn N: No more tool calls --> conversation ends

Nudge: If model received tool results but only described
       what to do (without acting), a nudge message is
       injected: "Now take action using the tools."
```

## 11. Lessons Learned

### What Worked

1. **Paperclip's issue system as the article database.** By storing articles as issue descriptions, we avoided building a separate CMS. The issue status naturally maps to the editorial workflow.

2. **RSS feeds over search engines.** Initial attempts to use DuckDuckGo for web search failed (server-side requests get blocked/captcha'd). Aggregating RSS feeds from Hackaday and Reddit proved reliable and sufficient.

3. **`tool_choice: "required"` on the first turn.** This single change eliminated the most frustrating issue — the LLM describing what it would do instead of actually calling tools.

4. **og:image extraction.** Most news sites include Open Graph images. Extracting these gives articles professional-looking hero images without any image generation.

5. **Staggered heartbeats + retry logic.** Prevents rate limiting from killing the entire pipeline when multiple agents fire simultaneously.

### What Was Challenging

1. **Model tool calling reliability.** `llama-3.3-70b-versatile` on Groq sometimes outputs tool calls as text instead of structured `tool_calls`. The fallback parser was essential.

2. **Agent prompt engineering.** Getting agents to consistently include source URLs and images required explicit, repeated instructions in both the system prompt and tool result `source_note`.

3. **Stuck issue accumulation.** When agents error out (rate limits, API failures), issues get stuck in `in_progress` or `in_review` with no active run. The admin dashboard's stuck issue detection and bulk status change was built specifically for this.

4. **Prompt leaking into titles.** Agents create issues with titles like "Write article on ESP32-P4 features" — the "Write article on" prefix is part of the prompt, not a real headline. Title cleaning logic was needed on the display side.

### The Bigger Picture

ESP32 Times demonstrates that Paperclip can orchestrate a functioning, autonomous business — in this case, a news agency — with minimal human intervention. The same pattern could be applied to:

- **Customer support**: Scout monitors incoming tickets, Writer drafts responses, Editor reviews
- **Content marketing**: CEO sets strategy, Scout researches competitors, Writer produces content
- **Code review**: Scout identifies PRs needing review, Reviewer analyzes code, Reporter summarizes findings
- **Market research**: Scout monitors data sources, Analyst produces reports, CEO adjusts strategy

The key insight is that Paperclip provides the **organizational substrate** — org charts, task management, heartbeats, budgets, governance — and the agents provide the **intelligence**. By separating these concerns, you can build autonomous systems that are auditable, controllable, and economically sustainable.

---

*ESP32 Times is open source. The Paperclip orchestration platform is available at [github.com/paperclipai/paperclip](https://github.com/paperclipai/paperclip).*
