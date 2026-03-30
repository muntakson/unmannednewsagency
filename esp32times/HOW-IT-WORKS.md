# ESP32 Times — How the AI Newsroom Works

## Architecture

ESP32 Times is powered by 4 AI agents orchestrated by [Paperclip](https://github.com/paperclipai/paperclip), running on Groq API (llama-3.3-70b-versatile).

| Agent  | Role            | What it does                                              |
|--------|-----------------|-----------------------------------------------------------|
| Scout  | News Scout      | Searches the web for ESP32 news, writes story briefs      |
| Writer | Technical Writer| Turns briefs into full articles                           |
| Editor | Content Editor  | Reviews articles for quality                              |
| CEO    | Chief Editor    | Sets editorial priorities, coordinates the team            |

## Two Ways Articles Get Created

### 1. Automatic Trigger (Heartbeat)

The Paperclip heartbeat service runs a scheduler every 30 seconds. Each agent has a heartbeat interval (currently 12 hours). When an agent's timer fires, it wakes up and does its job autonomously.

```
Heartbeat Timer (every 12h)
  |
  v
SCOUT wakes up (invocationSource: "heartbeat")
  |  1. list_my_issues() -- checks for assigned tasks
  |  2. web_search("ESP32 new project 2026") -- searches RSS feeds
  |     Sources: Hackaday, Reddit r/esp32
  |  3. fetch_url(article_url) -- reads full articles, extracts og:image
  |  4. update_issue() -- writes research brief with source URL + image
  |  5. create_issue("Write article on X", assignee=Writer) -- delegates to Writer
  |  6. update_issue(status="done") -- marks research complete
  |
  v
Heartbeat Scheduler detects Writer has a new "todo" task (~30s later)
  |
  v
WRITER wakes up (invocationSource: "assignment", triggerDetail: "system")
  |  1. list_my_issues() -- sees the task Scout created
  |  2. update_issue(status="in_progress") -- picks up the task
  |  3. update_issue(description="full article...") -- writes the article
  |  4. update_issue(status="in_review") -- marks ready for review
  |
  v
Article appears on esptimes.iotok.org
```

**How Scout chooses topics:** Scout's system prompt contains standing instructions to always search the web for ESP32 news. It calls `web_search` which aggregates real-time RSS feeds from Hackaday and Reddit r/esp32. Whatever is trending becomes the next article. Scout does NOT make up topics — it only writes about things it found via web search.

**How Scout triggers Writer:** Scout calls `create_issue()` with `assignee=Writer`. The heartbeat scheduler (running every 30s) detects that Writer has a `todo` task and auto-wakes Writer. This happens within seconds, not hours.

### 2. Manual Trigger (Admin Dashboard)

An admin enters a topic on the dashboard at `esptimes.iotok.org/dashboard` and clicks "Create".

```
ADMIN types "OpenMQTTGateway" and clicks Create
  |
  |  Dashboard POST /dashboard/api/issues
  |    -> creates issue "Scout: Research OpenMQTTGateway" (status: todo, assignee: Scout)
  |  Dashboard POST /dashboard/api/agents/scout/wakeup
  |    -> immediately wakes Scout (triggerDetail: "manual")
  |
  v
SCOUT wakes up (invocationSource: "on_demand", triggerDetail: "manual")
  |  1. list_my_issues() -- sees "Scout: Research OpenMQTTGateway"
  |  2. update_issue(status="in_progress")
  |  3. web_search("OpenMQTTGateway") -- searches for the topic
  |  4. fetch_url("https://www.openmqttgateway.com/") -- reads the source
  |  5. update_issue(description="research brief...") -- writes findings
  |  6. create_issue("Write article on OpenMQTTGateway", assignee=Writer)
  |  7. update_issue(status="done")
  |
  v
Heartbeat Scheduler detects Writer has new "todo" task (~30s)
  |
  v
WRITER wakes up (invocationSource: "assignment", triggerDetail: "system")
  |  1. Picks up the task
  |  2. Writes the full article
  |  3. Sets status to "in_review"
  |
  v
Article appears on esptimes.iotok.org
```

The dashboard also offers "Writer writes directly" mode, which skips Scout and creates the task directly for Writer.

## Trigger Mechanisms

| Trigger Type | When it fires | `invocationSource` | `triggerDetail` |
|---|---|---|---|
| **Heartbeat timer** | Every `intervalSec` (12h) per agent | `heartbeat` | `system` |
| **Assignment detection** | Agent has `todo` task + scheduler tick (30s) | `assignment` | `system` |
| **Manual wakeup** | Admin clicks "Wake Up" or "Create" on dashboard | `on_demand` | `manual` |

Key distinction:
- **Heartbeat timer** gates how often Scout proactively searches for new topics
- **Assignment detection** is fast (~30s) — once Scout creates a task for Writer, Writer wakes almost immediately
- **Manual wakeup** bypasses all timers and wakes the agent instantly

## Issue Lifecycle

```
todo  -->  in_progress  -->  in_review  -->  done
 |            |                 |              |
 |         Agent is           Ready for      Published on
 |         working on it      review         the website
 |
 Created by Scout,
 CEO, or Admin
```

## Web Tools

Agents interact with the real web through two tools:

- **`web_search(query)`** — Aggregates RSS feeds from Hackaday (ESP32 tag) and Reddit r/esp32. Filters results by query keywords. Returns titles, links, and descriptions.
- **`fetch_url(url)`** — Fetches any URL. For HTML pages: extracts text content, page title, and `og:image`. For RSS/Atom feeds: parses items. Returns a `source_note` prompting the agent to include attribution.

## Article Features

Each article on the site includes:
- **Hero image** — extracted from `og:image` of the source article
- **Image credit** — "Image: domain.com" overlay on the image
- **Source link** — "Source: Article Title" box linking to the original
- **Token cost** — "Groq: Xk tokens - $X.XX" showing LLM usage per article

## Configuration

- **Heartbeat intervals**: Scout/Writer/Editor = 12h, CEO = 12h
- **Model**: llama-3.3-70b-versatile on Groq API
- **Groq retry**: 3 attempts with backoff on 429 rate limits
- **Tool calling**: `tool_choice: "required"` on first turn, `"auto"` after
- **Max tool turns**: 15 per agent run
- **Paperclip server**: port 3100, ESP32 Times: port 3200
