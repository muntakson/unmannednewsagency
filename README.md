# Unmanned News Agency

Build and run a **fully autonomous AI news agency** — no human reporters, no editors, no manual publishing. AI agents discover news, write articles, and publish them to a website, 24/7.

This project is built on [Paperclip](https://github.com/paperclipai/paperclip), an open-source AI agent orchestration platform. Paperclip manages the "company" — org charts, task tracking, heartbeat scheduling, cost control — while the AI agents do the actual journalism.

## Live Examples

| Site | Topic | URL |
|---|---|---|
| **ESP32 Times** | ESP32 microcontroller ecosystem | [esptimes.iotok.org](https://esptimes.iotok.org) |
| **적정기술 타임즈** (Approtech Times) | Appropriate technology for developing regions | [appro.iotok.org](https://appro.iotok.org) |

Both sites run entirely on AI — from news discovery to article writing to web publishing.

---

## How It Works

### The Agent Team

Each unmanned news agency has 4 AI agents organized in a newsroom structure:

```
CEO (Chief Editor)
 ├── Scout (News Scout)    — finds news, writes research briefs
 ├── Writer (Tech Writer)  — turns briefs into full articles
 └── Editor (Content Editor) — reviews for quality (optional)
```

### The Pipeline

```
  Heartbeat Timer (every 12h)
       |
       v
  SCOUT wakes up
    1. web_search() — searches configured news sources
    2. fetch_url()  — reads full articles, extracts images
    3. Writes research brief with key facts + source URL
    4. create_issue(assignee=Writer) — delegates to Writer
       |
       v  (auto-triggered within ~30 seconds)
  WRITER wakes up
    1. Reads Scout's research brief
    2. Writes a 600-1200 word article
    3. Sets status to "done"
       |
       v
  Article appears on the website
```

**Key insight:** Scout has web tools (`web_search`, `fetch_url`) and does the research. Writer does NOT have web access — it writes purely from the brief Scout provides. This separation ensures article quality depends on Scout's research quality.

### Heartbeat System

Paperclip's heartbeat scheduler runs every 30 seconds. Each agent has a configurable interval (e.g., 12 hours). When the timer fires, the agent wakes up, checks its tasks, and acts autonomously. Agents can also trigger each other — when Scout creates a task for Writer, Writer wakes up within seconds.

### Two Ways to Create Articles

1. **Automatic (Heartbeat)** — Scout wakes up on schedule, searches the web, and starts the pipeline
2. **Manual (Admin Dashboard)** — An admin enters a topic or URL at `/dashboard`, and Scout researches it immediately

---

## How ESP32 Times Was Built

[ESP32 Times](https://esptimes.iotok.org) covers the ESP32 microcontroller ecosystem — dev boards, frameworks, community projects, tutorials.

### Architecture

- **Paperclip server** on port 3100 (orchestration + PostgreSQL)
- **ESP32 Times Express server** on port 3200 (reads articles from Paperclip API, renders as a news site)
- **4 agents** on Groq API using `llama-3.3-70b-versatile`
- **Heartbeat**: 12 hours (agents wake twice daily)
- **Company ID**: `2eee727c-7dbb-44b1-91dd-ba948c6d7e0a`

### Scout's News Sources

Scout is configured to search for ESP32 news from:
- Hackaday (ESP32 tag)
- Reddit r/esp32
- Espressif GitHub releases
- CNX Software
- Adafruit / SparkFun / Seeed new boards

### Setup

```bash
# 1. Start Paperclip server
pnpm --filter @paperclipai/server exec tsx src/index.ts

# 2. Run setup script (creates company + agents)
bash scripts/setup-esp32times.sh

# 3. Start ESP32 Times website
cd esp32times && node server.js
```

Full documentation: [`esp32times/HOW-IT-WORKS.md`](esp32times/HOW-IT-WORKS.md) and [`esp32times/BOOK-CHAPTER.md`](esp32times/BOOK-CHAPTER.md) (Korean: [`BOOK-CHAPTER-KO.md`](esp32times/BOOK-CHAPTER-KO.md))

---

## How 적정기술 타임즈 (Approtech Times) Was Built

[Approtech Times](https://appro.iotok.org) covers appropriate technology (적정기술) — innovations for water, energy, health, agriculture, education, and housing in underserved communities worldwide.

### Architecture

- **Paperclip server** on port 3100
- **Approtech Times Express server** on port 3300
- **4 agents** on Groq API using `llama-3.3-70b-versatile`
- **Pipeline**: Scout → Writer → done (Editor disabled due to llama tool-call instability)
- **Company ID**: `c372a25b-d2ad-483c-86a9-4f243592e557`

### Scout's News Sources

Scout is configured with Korean and international appropriate technology sources:

| Category | Sources |
|---|---|
| **Korean** | 적정기술학회 (appropriate.or.kr), 나눔과기술 (stiweb.org), 국경없는과학자회 |
| **International** | Engineering for Change, Practical Action, MIT D-Lab, Appropedia, UNESCO |
| **Academic** | Springer Journal of Appropriate Technology |
| **Search terms** | "appropriate technology", "solar water purifier", "off-grid energy", "AI poverty", "low-cost medical device" |

### Setup

```bash
# 1. Start Paperclip server
pnpm --filter @paperclipai/server exec tsx src/index.ts

# 2. Set Groq API key and run setup
export GROQ_API_KEY='gsk_...'
bash scripts/setup-approtechnews.sh

# 3. Start Approtech Times website
COMPANY_ID=c372a25b-d2ad-483c-86a9-4f243592e557 node approtechnews/server.js
```

Full documentation: [`approtechnews/BOOK-CHAPTER-KO.md`](approtechnews/BOOK-CHAPTER-KO.md)

---

## Step-by-Step: Customize This for Your Own News Topic

This section walks through a real example. Imagine an **NGO in Korea that helps migrant workers** — they want an unmanned news agency that automatically scrapes and publishes news about legal advice, visa regulations, homeland news, and support resources for migrant communities.

### Step 1: Clone the Repo and Set Up the Server

```bash
# On your Ubuntu server
git clone https://github.com/muntakson/unmannednewsagency.git
cd unmannednewsagency

# Install dependencies
pnpm install

# Start Paperclip server (runs on port 3100 with embedded PostgreSQL)
pnpm --filter @paperclipai/server exec tsx src/index.ts
```

**Requirements:** Node.js 20+, pnpm 9.15+

### Step 2: Choose Your LLM Backend

You have two options for powering your agents:

| Option | Pros | Cons | Best for |
|---|---|---|---|
| **Groq API** (cloud) | Fast, reliable, free tier available | Needs internet, rate limits | Production sites, reliable publishing |
| **Ollama** (local) | Free, private, no internet needed | Slower, needs GPU, less reliable tool calls | Experimentation, privacy-sensitive topics |

**For the NGO example, we recommend Groq with Qwen 3.5:**

```bash
# Get a free API key from https://console.groq.com
export GROQ_API_KEY='gsk_your_key_here'
```

**Or run locally with Ollama + Qwen:**

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull qwen3:32b

# Ollama runs at http://localhost:11434
```

### Step 3: Copy and Customize a Setup Script

Copy the Approtech Times setup script as your starting point:

```bash
cp scripts/setup-approtechnews.sh scripts/setup-migrantnews.sh
```

Now edit `scripts/setup-migrantnews.sh` and customize these sections:

#### 3a. Company Name and Mission

```bash
COMPANY=$(curl -s -X POST "$API/companies" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Migrant Support News",
    "mission": "AI-powered news agency providing migrant workers in Korea with legal advice, visa updates, homeland news, and community support resources in multiple languages.",
    "identifier": "migrantnews"
  }')
```

#### 3b. Scout Agent — Define Your News Sources

This is the most important customization. Scout's system prompt determines what news gets discovered:

```bash
"systemPrompt": "You are the News Scout for Migrant Support News.
Your job is to find news relevant to migrant workers in Korea.

Your workflow:
1. Call list_my_issues() to check for assigned tasks
2. If you have a task, research that topic
3. If no tasks, search for news autonomously

For AUTONOMOUS searches, use fetch_url on these sources:
- Korean immigration: https://www.immigration.go.kr/
- Ministry of Employment: https://www.moel.go.kr/
- 외국인근로자지원센터: https://www.migrantok.org/
- 다문화가족지원센터: https://www.liveinkorea.kr/
- Legal aid: https://www.klac.or.kr/ (대한법률구조공단)
- IOM Korea: https://korea.iom.int/

Also use web_search for:
- '외국인근로자 법률 상담'
- 'migrant worker Korea visa update'
- 'E-9 visa regulation change'
- '다문화가족 지원 정책'
- 'foreign worker rights Korea 2026'

For each story found:
1. Use fetch_url to read the full article
2. Write a research brief with key facts and source URL
3. Create a task for Writer using create_issue()
4. Mark your own task as done"
```

#### 3c. Writer Agent — Set the Writing Style

Customize the Writer's tone and format for your audience:

```bash
"systemPrompt": "You are the Writer for Migrant Support News.
Write clear, practical articles for migrant workers in Korea.

Style guidelines:
- Use simple, clear language (many readers are non-native Korean speakers)
- Lead with actionable information (what to do, where to go, deadlines)
- Include phone numbers, addresses, and website links when available
- Explain legal terms in plain language
- Add section headers for easy scanning
- 600-1200 words per article
- ALWAYS preserve Source: [title](url) from Scout's brief"
```

#### 3d. CEO Agent — Set the Heartbeat Schedule

The CEO's heartbeat determines how often agents autonomously search for news:

```bash
# Check for new news every 12 hours (43200 seconds)
"heartbeatEnabled": true,
"heartbeatIntervalSec": 43200

# Or every 6 hours for more frequent updates
"heartbeatIntervalSec": 21600

# Or once daily
"heartbeatIntervalSec": 86400
```

#### 3e. Choose the LLM Model

**Using Groq (recommended):**

```bash
"adapterType": "groq",
"adapterConfig": {
  "apiKey": "$GROQ_KEY",
  "model": "qwen-qwq-32b",        # or "llama-3.3-70b-versatile"
  "timeoutSec": 120
}
```

**Using local Ollama:**

```bash
"adapterType": "ollama_local",
"adapterConfig": {
  "model": "qwen3:32b",
  "baseUrl": "http://localhost:11434",
  "timeoutSec": 120
}
```

### Step 4: Run the Setup Script

```bash
# Create the company and agents in Paperclip
bash scripts/setup-migrantnews.sh

# Note down the Company ID printed at the end — you'll need it
```

### Step 5: Copy and Customize the Website

Copy the Approtech Times site as a template:

```bash
cp -r approtechnews/ migrantnews/
```

Edit `migrantnews/server.js`:

```javascript
const PORT = process.env.PORT || 3400;  // Pick a free port
const COMPANY_ID = process.env.COMPANY_ID || "your-company-id-here";
```

Customize the HTML templates in `migrantnews/views/` — change the site name, colors, logo, and navigation.

### Step 6: Start Everything

```bash
# Terminal 1: Paperclip server (if not already running)
pnpm --filter @paperclipai/server exec tsx src/index.ts

# Terminal 2: Your news site
COMPANY_ID=your-company-id node migrantnews/server.js
```

Your unmanned news agency is now live at `http://localhost:3400`.

### Step 7: Expose to the Internet (Optional)

Set up Nginx reverse proxy on your Ubuntu server:

```nginx
server {
    server_name migrantnews.example.org;

    location / {
        proxy_pass http://127.0.0.1:3400;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/migrantnews /etc/nginx/sites-enabled/
sudo certbot --nginx -d migrantnews.example.org   # Free HTTPS
sudo systemctl reload nginx
```

### Step 8: Manual Article Creation via Dashboard

Visit `http://localhost:3400/dashboard` to manually trigger articles:

| Input method | Result |
|---|---|
| Direct article URL (e.g. `immigration.go.kr/news/...`) | **Best** — Scout reads the page and creates a detailed brief |
| Topic with key facts in the description | **Good** — Writer uses facts directly, no hallucination |
| Short topic text (e.g. "E-9 visa changes 2026") | **OK** — Scout uses `web_search`, results vary |
| Google search URL | **Bad** — `fetch_url` can't parse JS-rendered Google pages |

---

## Project Structure

```
unmannednewsagency/
  server/              — Paperclip API server (Express.js, port 3100)
  ui/                  — Paperclip React dashboard
  packages/
    adapters/
      groq/            — Groq cloud API adapter (recommended)
      ollama-local/    — Ollama local LLM adapter
      claude-local/    — Claude Code adapter
      codex-local/     — OpenAI Codex adapter
    db/                — Database schema (Drizzle ORM + PostgreSQL)
    shared/            — Shared types and constants
  esp32times/          — ESP32 Times news site
  approtechnews/       — Approtech Times news site
  scripts/
    setup-esp32times.sh      — ESP32 Times setup script
    setup-approtechnews.sh   — Approtech Times setup script
```

## Requirements

- **OS**: Ubuntu 20.04+ (or any Linux with Node.js)
- **Node.js**: 20+
- **pnpm**: 9.15+
- **LLM**: Groq API key (free at [console.groq.com](https://console.groq.com)) or local Ollama with GPU

## Common Pitfalls

- Kill ALL tsx/pnpm processes before restarting server: `pkill -f "tsx"`
- API field for issue assignment is `assigneeAgentId`, NOT `assigneeId`
- Ollama tool calling requires `stream: false`
- When updating agent config, read full config first to avoid overwriting API keys
- Groq has rate limits — adapter retries up to 3 times with backoff
- Facebook pages are hard to scrape with `fetch_url`
- Google search result pages can't be parsed — use direct article URLs

## Credits

Built on [Paperclip](https://github.com/paperclipai/paperclip) — open-source orchestration for AI agent teams.

## License

MIT
