#!/usr/bin/env bash
# =============================================================================
# ESP32 Times.org — Paperclip Company Setup
#
# Creates a company with 4 AI agents using Ollama (local LLM):
#   CEO        — coordinates all agents, sets editorial priorities
#   Scout      — monitors ESP32 news sources, creates story tasks
#   Writer     — picks up story tasks, researches and writes articles
#   Editor     — reviews drafts, ensures quality, publishes
#
# Prerequisites:
#   1. Paperclip server running at http://localhost:3100
#   2. Ollama running at http://localhost:11434
#   3. A model pulled: ollama pull llama3.1 (or your preferred model)
#
# Usage:
#   bash scripts/setup-esp32pedia.sh [OLLAMA_MODEL]
#
# Example:
#   bash scripts/setup-esp32pedia.sh llama3.1
#   bash scripts/setup-esp32pedia.sh qwen2.5-coder
# =============================================================================

set -euo pipefail

API="${PAPERCLIP_API_URL:-http://localhost:3100}/api"
MODEL="${1:-llama3.1}"
OLLAMA_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
WORKSPACE="${ESP32TIMES_WORKSPACE:-$(pwd)}"

echo "=== ESP32 Times.org — Paperclip Company Setup ==="
echo "API:       $API"
echo "Model:     $MODEL"
echo "Ollama:    $OLLAMA_URL"
echo "Workspace: $WORKSPACE"
echo ""

# ---------------------------------------------------------------------------
# Helper: POST JSON and extract field from response
# ---------------------------------------------------------------------------
post() {
  local url="$1"
  local data="$2"
  curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data"
}

jq_field() {
  python3 -c "import sys,json; print(json.load(sys.stdin)$1)"
}

# ---------------------------------------------------------------------------
# 1. Create Company
# ---------------------------------------------------------------------------
echo ">>> Creating company: ESP32 Times..."
COMPANY_JSON=$(post "$API/companies" "$(cat <<'PAYLOAD'
{
  "name": "ESP32 Times",
  "description": "AI-powered news site covering ESP32 microcontroller ecosystem — development boards, frameworks, projects, tutorials, and community updates at esp32times.org"
}
PAYLOAD
)")
COMPANY_ID=$(echo "$COMPANY_JSON" | jq_field "['id']")
echo "    Company ID: $COMPANY_ID"

# ---------------------------------------------------------------------------
# 2. Create CEO Agent
# ---------------------------------------------------------------------------
echo ">>> Creating agent: CEO..."
CEO_JSON=$(post "$API/companies/$COMPANY_ID/agents" "$(cat <<PAYLOAD
{
  "name": "CEO",
  "role": "ceo",
  "title": "Chief Editor",
  "icon": "crown",
  "reportsTo": null,
  "capabilities": "Editorial strategy, content calendar planning, agent coordination, quality standards enforcement, audience growth strategy",
  "adapterType": "ollama_local",
  "adapterConfig": {
    "model": "$MODEL",
    "baseUrl": "$OLLAMA_URL",
    "cwd": "$WORKSPACE",
    "systemPrompt": "You are the Chief Editor of ESP32 Times.org, an AI-powered news site about the ESP32 microcontroller ecosystem. Your responsibilities: 1) Set editorial priorities based on what's trending in the ESP32 community. 2) Review the task board and ensure agents are productive. 3) Create story assignments for the Scout and Writer. 4) Maintain quality standards. 5) Plan the content calendar. Always use the Paperclip skill to check your tasks and update status.",
    "promptTemplate": "You are agent {{agent.id}} ({{agent.name}}), the Chief Editor of ESP32 Times.org. Check your assigned tasks and coordinate your team. Focus on: what stories are in progress, what needs review, and what new topics to cover this week.",
    "temperature": 0.7,
    "timeoutSec": 120,
    "graceSec": 15
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 3600,
      "wakeOnDemand": true
    }
  },
  "budgetMonthlyCents": 0
}
PAYLOAD
)")
CEO_ID=$(echo "$CEO_JSON" | jq_field "['id']")
echo "    CEO Agent ID: $CEO_ID"

# ---------------------------------------------------------------------------
# 3. Create Scout Agent (reports to CEO)
# ---------------------------------------------------------------------------
echo ">>> Creating agent: Scout..."
SCOUT_JSON=$(post "$API/companies/$COMPANY_ID/agents" "$(cat <<PAYLOAD
{
  "name": "Scout",
  "role": "engineer",
  "title": "News Scout",
  "icon": "search",
  "reportsTo": "$CEO_ID",
  "capabilities": "ESP32 news monitoring, source tracking, story discovery, trend identification, RSS/forum monitoring, GitHub release tracking",
  "adapterType": "ollama_local",
  "adapterConfig": {
    "model": "$MODEL",
    "baseUrl": "$OLLAMA_URL",
    "cwd": "$WORKSPACE",
    "systemPrompt": "You are the News Scout for ESP32 Times.org. Your job is to find newsworthy stories about the ESP32 ecosystem. Topics to monitor: new ESP32 variants and dev boards (ESP32-S3, ESP32-C6, ESP32-H2, etc.), ESP-IDF framework updates, Arduino core releases, MicroPython/CircuitPython updates, interesting community projects, Espressif announcements, security advisories, comparison articles, tutorials worth covering. When you find a story, create a task for the Writer with a clear brief: what the story is, why it matters, key sources to reference.",
    "promptTemplate": "You are agent {{agent.id}} ({{agent.name}}), the News Scout for ESP32 Times.org. Check your tasks. Your primary job: identify new ESP32 stories worth covering and create well-briefed tasks for the Writer. Think about what ESP32 enthusiasts, makers, and professional developers want to read.",
    "temperature": 0.8,
    "timeoutSec": 120,
    "graceSec": 15
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 21600,
      "wakeOnDemand": true
    }
  },
  "budgetMonthlyCents": 0
}
PAYLOAD
)")
SCOUT_ID=$(echo "$SCOUT_JSON" | jq_field "['id']")
echo "    Scout Agent ID: $SCOUT_ID"

# ---------------------------------------------------------------------------
# 4. Create Writer Agent (reports to CEO)
# ---------------------------------------------------------------------------
echo ">>> Creating agent: Writer..."
WRITER_JSON=$(post "$API/companies/$COMPANY_ID/agents" "$(cat <<PAYLOAD
{
  "name": "Writer",
  "role": "engineer",
  "title": "Technical Writer",
  "icon": "file-code",
  "reportsTo": "$CEO_ID",
  "capabilities": "Technical writing, ESP32 article creation, code examples, tutorial writing, news summarization, markdown content creation",
  "adapterType": "ollama_local",
  "adapterConfig": {
    "model": "$MODEL",
    "baseUrl": "$OLLAMA_URL",
    "cwd": "$WORKSPACE",
    "systemPrompt": "You are the Technical Writer for ESP32 Times.org. You write clear, accurate, and engaging articles about the ESP32 ecosystem. Style guidelines: 1) Lead with why it matters to the reader. 2) Include code snippets when relevant (Arduino, ESP-IDF, MicroPython). 3) Keep paragraphs short — web readers scan. 4) Add context for beginners but don't bore experts. 5) Always mention which ESP32 variants are affected. 6) Output articles in Markdown format. 7) Include a TL;DR at the top. 8) Target 500-1500 words per article.",
    "promptTemplate": "You are agent {{agent.id}} ({{agent.name}}), the Technical Writer for ESP32 Times.org. Check your assigned tasks. Pick up story briefs from the Scout and write high-quality articles. When done, mark the task for review so the Editor can check it.",
    "temperature": 0.6,
    "timeoutSec": 180,
    "graceSec": 15
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 7200,
      "wakeOnDemand": true
    }
  },
  "budgetMonthlyCents": 0
}
PAYLOAD
)")
WRITER_ID=$(echo "$WRITER_JSON" | jq_field "['id']")
echo "    Writer Agent ID: $WRITER_ID"

# ---------------------------------------------------------------------------
# 5. Create Editor Agent (reports to CEO)
# ---------------------------------------------------------------------------
echo ">>> Creating agent: Editor..."
EDITOR_JSON=$(post "$API/companies/$COMPANY_ID/agents" "$(cat <<PAYLOAD
{
  "name": "Editor",
  "role": "engineer",
  "title": "Content Editor",
  "icon": "shield",
  "reportsTo": "$CEO_ID",
  "capabilities": "Content review, fact-checking, editorial quality assurance, SEO optimization, headline writing, final publication approval",
  "adapterType": "ollama_local",
  "adapterConfig": {
    "model": "$MODEL",
    "baseUrl": "$OLLAMA_URL",
    "cwd": "$WORKSPACE",
    "systemPrompt": "You are the Content Editor for ESP32 Times.org. You review articles written by the Writer before publication. Your checklist: 1) Technical accuracy — are ESP32 details correct? 2) Clarity — would a hobbyist understand this? 3) Completeness — are key details missing? 4) SEO — is the title searchable? Are keywords natural? 5) Code correctness — do snippets compile? Are pin numbers right? 6) Tone — informative but not dry, enthusiastic but not hype. If an article needs fixes, send it back with specific feedback. If it's good, mark it as done (published).",
    "promptTemplate": "You are agent {{agent.id}} ({{agent.name}}), the Content Editor for ESP32 Times.org. Check tasks in review status. Review articles for accuracy, clarity, and quality. Approve good articles or send them back with feedback.",
    "temperature": 0.4,
    "timeoutSec": 120,
    "graceSec": 15
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 7200,
      "wakeOnDemand": true
    }
  },
  "budgetMonthlyCents": 0
}
PAYLOAD
)")
EDITOR_ID=$(echo "$EDITOR_JSON" | jq_field "['id']")
echo "    Editor Agent ID: $EDITOR_ID"

# ---------------------------------------------------------------------------
# 6. Create initial seed tasks
# ---------------------------------------------------------------------------
echo ""
echo ">>> Creating seed tasks..."

post "$API/companies/$COMPANY_ID/issues" "$(cat <<PAYLOAD
{
  "title": "Scout: Find top 5 ESP32 news stories this week",
  "description": "Scan the ESP32 ecosystem for the most newsworthy stories this week. Look at:\n- Espressif GitHub releases (esp-idf, arduino-esp32)\n- ESP32 subreddit top posts\n- Hackaday ESP32 tagged articles\n- CNX Software ESP32 posts\n- New boards on Adafruit/SparkFun/Seeed\n\nCreate a task for the Writer for each story worth covering. Include: headline, 2-3 sentence brief, key sources.",
  "status": "todo",
  "priority": "high",
  "assigneeAgentId": "$SCOUT_ID"
}
PAYLOAD
)" > /dev/null
echo "    Task: Scout initial news sweep"

post "$API/companies/$COMPANY_ID/issues" "$(cat <<PAYLOAD
{
  "title": "Write: Welcome article — What is ESP32 Times?",
  "description": "Write the inaugural article for esp32times.org introducing the site.\n\nCover:\n- What ESP32 Times is (AI-powered ESP32 news)\n- What topics we cover (boards, frameworks, projects, tutorials)\n- Who it's for (hobbyists, makers, professional embedded devs)\n- How often we publish\n- Brief ESP32 ecosystem overview for newcomers\n\nTone: welcoming, enthusiastic, technically credible.\nLength: 800-1000 words.\nFormat: Markdown with frontmatter (title, date, tags, summary).",
  "status": "todo",
  "priority": "critical",
  "assigneeAgentId": "$WRITER_ID"
}
PAYLOAD
)" > /dev/null
echo "    Task: Welcome article"

post "$API/companies/$COMPANY_ID/issues" "$(cat <<PAYLOAD
{
  "title": "CEO: Define editorial calendar and content categories",
  "description": "Define the content strategy for esp32times.org:\n\n1. Content categories (e.g., News, Tutorials, Board Reviews, Project Showcase, Framework Updates)\n2. Publishing cadence target (e.g., 3-5 articles/week)\n3. Priority topics for launch month\n4. Quality guidelines document\n5. SEO keyword targets\n\nCreate sub-tasks as needed and assign to the appropriate agents.",
  "status": "todo",
  "priority": "critical",
  "assigneeAgentId": "$CEO_ID"
}
PAYLOAD
)" > /dev/null
echo "    Task: Editorial calendar"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== ESP32 Times Company Setup Complete ==="
echo ""
echo "Company: ESP32 Times ($COMPANY_ID)"
echo ""
echo "Org Chart:"
echo "  CEO (Chief Editor)     — $CEO_ID"
echo "  ├── Scout (News Scout) — $SCOUT_ID"
echo "  ├── Writer (Tech Writer) — $WRITER_ID"
echo "  └── Editor (Content Editor) — $EDITOR_ID"
echo ""
echo "Heartbeat Schedule:"
echo "  CEO:    every 1 hour"
echo "  Scout:  every 6 hours"
echo "  Writer: every 2 hours"
echo "  Editor: every 2 hours"
echo ""
echo "Seed Tasks: 3 created (scout sweep, welcome article, editorial calendar)"
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:3100 to see the dashboard"
echo "  2. Click on ESP32 Times company to see the org chart"
echo "  3. Invoke a heartbeat: curl -X POST $API/agents/$CEO_ID/heartbeat/invoke"
echo "  4. Watch agent runs in the UI"
echo ""
echo "Budget is \$0 (unlimited) since Ollama is free. Adjust in the UI if needed."
