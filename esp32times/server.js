import express from "express";
import { marked } from "marked";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3200;
const PAPERCLIP_API = process.env.PAPERCLIP_API || "http://127.0.0.1:3100/api";
const COMPANY_ID = process.env.COMPANY_ID || "2eee727c-7dbb-44b1-91dd-ba948c6d7e0a";

app.use(express.static(path.join(__dirname, "public")));

// Fetch issues from Paperclip
async function fetchIssues(status) {
  const url = `${PAPERCLIP_API}/companies/${COMPANY_ID}/issues?status=${status}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

// Fetch single issue
async function fetchIssue(id) {
  const res = await fetch(`${PAPERCLIP_API}/issues/${id}`);
  if (!res.ok) return null;
  return res.json();
}

// Fetch agents for bylines
async function fetchAgents() {
  const res = await fetch(`${PAPERCLIP_API}/companies/${COMPANY_ID}/agents`);
  if (!res.ok) return [];
  return res.json();
}

// Get all published articles (done status) and in-progress ones
async function getArticles() {
  const [done, inReview, inProgress] = await Promise.all([
    fetchIssues("done"),
    fetchIssues("in_review"),
    fetchIssues("in_progress"),
  ]);
  // Filter to only article-like issues (Writer tasks)
  const isArticle = (issue) =>
    issue.title?.toLowerCase().includes("write") ||
    issue.title?.toLowerCase().includes("article") ||
    issue.title?.toLowerCase().includes("review") ||
    issue.title?.toLowerCase().includes("esp32") ||
    issue.description?.length > 200;

  return {
    published: done.filter(isArticle),
    drafts: [...inReview, ...inProgress].filter(isArticle),
    all: [...done, ...inReview, ...inProgress],
  };
}

// HTML layout wrapper
function layout(title, content, activePage = "home") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ESP32 Times</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=7">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
</head>
<body>
  <header>
    <div class="container">
      <div class="header-inner">
        <a href="/" class="logo">
          <span class="logo-icon">⚡</span>
          <div>
            <span class="logo-text">ESP32 Times</span>
            <span class="logo-sub">AI-Powered Microcontroller News</span>
          </div>
        </a>
        <nav>
          <a href="/" class="${activePage === "home" ? "active" : ""}">Home</a>
          <a href="/news" class="${activePage === "news" ? "active" : ""}">News</a>
          <a href="/about" class="${activePage === "about" ? "active" : ""}">About</a>
          <a href="/status" class="${activePage === "status" ? "active" : ""}">Newsroom</a>
          <a href="/dashboard" class="nav-admin ${activePage === "dashboard" ? "active" : ""}">Dashboard</a>
        </nav>
      </div>
    </div>
  </header>
  <main>
    <div class="container">
      ${content}
    </div>
  </main>
  <footer>
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <span class="logo-icon">⚡</span> ESP32 Times
          <span class="footer-sep">·</span>
          AI-powered news about the ESP32 ecosystem
        </div>
        <div class="footer-meta">
          Powered by <a href="https://github.com/paperclipai/paperclip" target="_blank">Paperclip AI</a> ·
          Agents running on Ollama (llama3.1)
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

// Format date
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Extract a summary from description
function extractSummary(desc, maxLen = 200) {
  if (!desc) return "No summary available.";
  // Strip markdown formatting for summary
  const plain = desc
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n/g, " ")
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + "…" : plain;
}

// Assign category based on title/content
function getCategory(issue) {
  const t = (issue.title || "").toLowerCase();
  const d = (issue.description || "").toLowerCase();
  if (t.includes("tutorial") || d.includes("tutorial") || d.includes("how to")) return "Tutorial";
  if (t.includes("review") || d.includes("board review")) return "Review";
  if (t.includes("project") || d.includes("project showcase")) return "Project";
  if (t.includes("update") || d.includes("release") || d.includes("framework")) return "Update";
  if (t.includes("security") || d.includes("security") || d.includes("cve")) return "Security";
  return "News";
}

function categoryColor(cat) {
  const colors = {
    News: "#3b82f6",
    Tutorial: "#22c55e",
    Review: "#f59e0b",
    Project: "#8b5cf6",
    Update: "#06b6d4",
    Security: "#ef4444",
  };
  return colors[cat] || "#6b7280";
}

// Fetch all heartbeat runs and build a map of issue_id -> { inputTokens, outputTokens }
async function fetchTokenUsageByIssue() {
  try {
    const res = await fetch(`${PAPERCLIP_API}/companies/${COMPANY_ID}/heartbeat-runs?limit=100`);
    if (!res.ok) return {};
    const runs = await res.json();
    const usage = {};
    for (const run of runs) {
      const stdout = run.resultJson?.stdout || "";
      const tokens = run.usageJson || {};
      const input = tokens.inputTokens || 0;
      const output = tokens.outputTokens || 0;
      if (input === 0 && output === 0) continue;
      // Find issue IDs referenced in tool calls
      const issueIds = new Set();
      for (const line of stdout.split("\n")) {
        try {
          const ev = JSON.parse(line);
          if (ev.type === "tool_call" && ev.arguments) {
            const id = ev.arguments.issue_id || ev.arguments.id;
            if (id) issueIds.add(id);
          }
        } catch {}
      }
      for (const id of issueIds) {
        if (!usage[id]) usage[id] = { inputTokens: 0, outputTokens: 0 };
        usage[id].inputTokens += input;
        usage[id].outputTokens += output;
      }
    }
    return usage;
  } catch {
    return {};
  }
}

// Groq pricing for llama-3.3-70b-versatile (per million tokens)
const GROQ_INPUT_COST_PER_M = 0.59;
const GROQ_OUTPUT_COST_PER_M = 0.79;

function formatTokenCost(tokenInfo) {
  if (!tokenInfo) return "";
  const { inputTokens, outputTokens } = tokenInfo;
  const total = inputTokens + outputTokens;
  const cost = (inputTokens / 1_000_000) * GROQ_INPUT_COST_PER_M + (outputTokens / 1_000_000) * GROQ_OUTPUT_COST_PER_M;
  const costStr = cost < 0.01 ? "<$0.01" : "$" + cost.toFixed(2);
  const tokStr = total >= 1000 ? (total / 1000).toFixed(1) + "k" : total.toString();
  return `<div class="card-tokens">Groq: ${tokStr} tokens · ${costStr}</div>`;
}

// Extract first image URL from markdown description
function extractImage(desc) {
  if (!desc) return null;
  // Match markdown images: ![alt](url)
  const mdMatch = desc.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (mdMatch) return mdMatch[1];
  // Match raw image URLs
  const urlMatch = desc.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp))/i);
  return urlMatch ? urlMatch[1] : null;
}

// Extract source URL from description (looks for "Source: [title](url)" pattern)
function extractSource(desc) {
  if (!desc) return null;
  // Match "Source: [title](url)" markdown link
  const srcMatch = desc.match(/Source:\s*\[([^\]]+)\]\(([^)]+)\)/i);
  if (srcMatch) return { title: srcMatch[1], url: srcMatch[2] };
  // Match article URLs (not image URLs)
  const notImage = (url) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url);
  const allUrls = [...desc.matchAll(/https?:\/\/(?:hackaday\.com|hackster\.io|(?:www\.)?reddit\.com)\/[^\s"')]+/g)];
  const anySource = allUrls.map(m => m[0]).filter(notImage).map(u => [u]);
  const firstSource = anySource.length > 0 ? anySource[0] : null;
  if (firstSource) {
    try {
      const hostname = new URL(firstSource[0]).hostname.replace("www.", "");
      return { title: hostname, url: firstSource[0] };
    } catch {}
  }
  return null;
}

// Extract image credit from description
function extractImageCredit(desc) {
  if (!desc) return null;
  // Match "*Image: [domain](url)*"
  const creditMatch = desc.match(/\*Image:\s*\[([^\]]+)\]\(([^)]+)\)\*/i);
  if (creditMatch) return { domain: creditMatch[1], url: creditMatch[2] };
  // Fallback: derive from image URL
  const img = extractImage(desc);
  if (img) {
    try {
      const hostname = new URL(img).hostname.replace("www.", "");
      return { domain: hostname, url: img };
    } catch {}
  }
  return null;
}

// Strip prompt prefixes from issue titles
function cleanIssueTitle(title) {
  return (title || "")
    .replace(/^(Write|Scout|CEO|Editor):\s*/i, "")
    .replace(/^Write\s*—\s*/i, "")
    .replace(/^Write\s+article\s+on\s+/i, "")
    .replace(/^Research\s+/i, "")
    .trim();
}

// Article card HTML
function articleCard(issue, featured = false, tokenUsage = {}) {
  const cat = getCategory(issue);
  const cleanTitle = cleanIssueTitle(issue.title);
  const image = extractImage(issue.description);
  return `
    <article class="card ${featured ? "card-featured" : ""} ${image ? "card-has-image" : ""}">
      ${image ? `<div class="card-image"><img src="${image}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>` : ""}
      <div class="card-body">
        <div class="card-category" style="--cat-color: ${categoryColor(cat)}">${cat}</div>
        <h${featured ? "2" : "3"}>
          <a href="/article/${issue.id}">${cleanTitle}</a>
        </h${featured ? "2" : "3"}>
        <p class="card-summary">${extractSummary(issue.description)}</p>
        <div class="card-meta">
          <span class="card-date">${fmtDate(issue.updatedAt || issue.createdAt)}</span>
          <span class="card-status status-${issue.status}">${issue.status.replace("_", " ")}</span>
          ${issue.priority ? `<span class="card-priority priority-${issue.priority}">${issue.priority}</span>` : ""}
        </div>
        ${formatTokenCost(tokenUsage[issue.id])}
      </div>
    </article>`;
}

// ---------- Routes ----------

app.get("/", async (_req, res) => {
  try {
    const [{ published, drafts, all }, tokenUsage] = await Promise.all([
      getArticles(),
      fetchTokenUsageByIssue(),
    ]);
    const articles = [...published, ...drafts].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    const featured = articles[0];
    const rest = articles.slice(1, 7);

    let content = `
      <section class="hero">
        <h1>The Pulse of the ESP32 Ecosystem</h1>
        <p class="hero-sub">AI-curated news, tutorials, and insights about ESP32 development boards, frameworks, and community projects — updated around the clock by our AI newsroom.</p>
      </section>`;

    if (featured) {
      content += `<section class="featured">${articleCard(featured, true, tokenUsage)}</section>`;
    }

    if (rest.length > 0) {
      content += `<section class="grid">${rest.map((a) => articleCard(a, false, tokenUsage)).join("")}</section>`;
    }

    if (articles.length === 0) {
      content += `
        <section class="empty-state">
          <div class="empty-icon">📡</div>
          <h2>Newsroom is warming up</h2>
          <p>Our AI agents are currently scouting, writing, and editing stories about the ESP32 ecosystem. Check back soon for fresh articles!</p>
          <a href="/status" class="btn">View Newsroom Status</a>
        </section>`;
    }

    res.send(layout("Home", content, "home"));
  } catch (e) {
    console.error("Home error:", e);
    res.status(500).send(layout("Error", `<p class="error">Failed to load articles. Is Paperclip running?</p>`));
  }
});

app.get("/news", async (_req, res) => {
  try {
    const [{ published, drafts }, tokenUsage] = await Promise.all([
      getArticles(),
      fetchTokenUsageByIssue(),
    ]);
    const articles = [...published, ...drafts].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    let content = `<h1 class="page-title">All Articles</h1>`;
    if (articles.length > 0) {
      content += `<section class="grid">${articles.map((a) => articleCard(a, false, tokenUsage)).join("")}</section>`;
    } else {
      content += `<p class="empty-msg">No articles yet. Our AI agents are working on it!</p>`;
    }

    res.send(layout("News", content, "news"));
  } catch (e) {
    res.status(500).send(layout("Error", `<p class="error">Failed to load.</p>`));
  }
});

app.get("/article/:id", async (req, res) => {
  try {
    const [issue, tokenUsage] = await Promise.all([
      fetchIssue(req.params.id),
      fetchTokenUsageByIssue(),
    ]);
    if (!issue) return res.status(404).send(layout("Not Found", `<h1>Article not found</h1>`));

    const cat = getCategory(issue);
    const cleanTitle = cleanIssueTitle(issue.title);

    const tokenInfo = tokenUsage[issue.id];
    const source = extractSource(issue.description);
    const imageCredit = extractImageCredit(issue.description);
    const heroImage = extractImage(issue.description);

    // Strip source/image lines from body since we display them separately
    let bodyMd = (issue.description || "*No content yet.*")
      .replace(/^Source:\s*\[[^\]]*\]\([^)]*\)\s*$/gm, "")
      .replace(/!\[[^\]]*\]\([^)]+\)\s*/g, "")
      .replace(/^\*Image:\s*\[[^\]]*\]\([^)]*\)\*\s*$/gm, "")
      .trim();
    const htmlContent = await marked(bodyMd);

    const content = `
      <article class="article-full">
        <div class="article-header">
          <div class="card-category" style="--cat-color: ${categoryColor(cat)}">${cat}</div>
          <h1>${cleanTitle}</h1>
          <div class="article-meta">
            <span>${fmtDate(issue.updatedAt || issue.createdAt)}</span>
            <span class="card-status status-${issue.status}">${issue.status.replace("_", " ")}</span>
          </div>
        </div>
        ${heroImage ? `
        <div class="article-hero-image">
          <img src="${heroImage}" alt="${cleanTitle}" onerror="this.parentElement.remove()">
          ${imageCredit ? `<div class="article-image-credit">Image: <a href="${imageCredit.url}" target="_blank" rel="noopener">${imageCredit.domain}</a></div>` : ""}
        </div>` : ""}
        <div class="article-body prose">${htmlContent}</div>
        ${source ? `
        <div class="article-source">
          📰 Source: <a href="${source.url}" target="_blank" rel="noopener">${source.title}</a>
        </div>` : ""}
        <div class="article-footer">
          <a href="/" class="btn btn-outline">← Back to Home</a>
          ${tokenInfo ? `<div class="card-tokens" style="margin-top: 1rem">Groq: ${((tokenInfo.inputTokens + tokenInfo.outputTokens) / 1000).toFixed(1)}k tokens (${(tokenInfo.inputTokens / 1000).toFixed(1)}k in / ${(tokenInfo.outputTokens / 1000).toFixed(1)}k out) · ${((tokenInfo.inputTokens / 1_000_000) * GROQ_INPUT_COST_PER_M + (tokenInfo.outputTokens / 1_000_000) * GROQ_OUTPUT_COST_PER_M) < 0.01 ? "<$0.01" : "$" + ((tokenInfo.inputTokens / 1_000_000) * GROQ_INPUT_COST_PER_M + (tokenInfo.outputTokens / 1_000_000) * GROQ_OUTPUT_COST_PER_M).toFixed(2)}</div>` : ""}
        </div>
      </article>`;

    res.send(layout(cleanTitle, content));
  } catch (e) {
    console.error("Article error:", e);
    res.status(500).send(layout("Error", `<p class="error">Failed to load article.</p>`));
  }
});

app.get("/status", async (_req, res) => {
  try {
    const agents = await fetchAgents();
    const allIssues = await fetchIssues("todo")
      .then(async (todo) => {
        const ip = await fetchIssues("in_progress");
        const ir = await fetchIssues("in_review");
        const done = await fetchIssues("done");
        return { todo, in_progress: ip, in_review: ir, done };
      });

    let content = `
      <h1 class="page-title">🏢 Newsroom Status</h1>
      <p class="page-desc">Meet our AI agents and see what they're working on.</p>

      <section class="agents-grid">
        ${agents.map((a) => `
          <div class="agent-card">
            <div class="agent-icon">${a.role === "ceo" ? "👑" : a.title?.includes("Scout") ? "🔍" : a.title?.includes("Writer") ? "✍️" : "📝"}</div>
            <h3>${a.name}</h3>
            <div class="agent-title">${a.title || a.role}</div>
            <div class="agent-status status-${a.status}">${a.status}</div>
          </div>
        `).join("")}
      </section>

      <section class="pipeline">
        <h2>Content Pipeline</h2>
        <div class="pipeline-cols">
          <div class="pipeline-col">
            <h4>📋 Todo <span class="count">${allIssues.todo.length}</span></h4>
            ${allIssues.todo.map((i) => `<div class="pipeline-item">${i.title}</div>`).join("") || "<p class='empty-small'>Empty</p>"}
          </div>
          <div class="pipeline-col">
            <h4>🔨 In Progress <span class="count">${allIssues.in_progress.length}</span></h4>
            ${allIssues.in_progress.map((i) => `<div class="pipeline-item">${i.title}</div>`).join("") || "<p class='empty-small'>Empty</p>"}
          </div>
          <div class="pipeline-col">
            <h4>👁️ In Review <span class="count">${allIssues.in_review.length}</span></h4>
            ${allIssues.in_review.map((i) => `<div class="pipeline-item">${i.title}</div>`).join("") || "<p class='empty-small'>Empty</p>"}
          </div>
          <div class="pipeline-col">
            <h4>✅ Published <span class="count">${allIssues.done.length}</span></h4>
            ${allIssues.done.map((i) => `<div class="pipeline-item">${i.title}</div>`).join("") || "<p class='empty-small'>Empty</p>"}
          </div>
        </div>
      </section>`;

    res.send(layout("Newsroom", content, "status"));
  } catch (e) {
    console.error("Status error:", e);
    res.status(500).send(layout("Error", `<p class="error">Failed to load status.</p>`));
  }
});

// ---------- Admin Dashboard ----------

app.use(express.json());

// API proxy endpoints for admin actions
app.post("/dashboard/api/issues/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const resp = await fetch(`${PAPERCLIP_API}/issues/${req.params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!resp.ok) return res.status(resp.status).json({ error: "Failed to update issue" });
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/dashboard/api/issues", async (req, res) => {
  try {
    const { title, description, assigneeAgentId, priority } = req.body;
    const resp = await fetch(`${PAPERCLIP_API}/companies/${COMPANY_ID}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, assigneeAgentId, priority: priority || "medium", status: "todo" }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/dashboard/api/agents/:id/wakeup", async (req, res) => {
  try {
    const resp = await fetch(`${PAPERCLIP_API}/agents/${req.params.id}/wakeup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "on_demand", triggerDetail: "manual" }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/dashboard", async (_req, res) => {
  try {
    const agents = await fetchAgents();
    const [todo, inProgress, inReview, done] = await Promise.all([
      fetchIssues("todo"),
      fetchIssues("in_progress"),
      fetchIssues("in_review"),
      fetchIssues("done"),
    ]);
    const allIssues = [...todo, ...inProgress, ...inReview, ...done];
    const heartbeatRes = await fetch(`${PAPERCLIP_API}/companies/${COMPANY_ID}/heartbeat-runs`);
    const heartbeatRuns = heartbeatRes.ok ? await heartbeatRes.json() : [];
    const recentRuns = heartbeatRuns.slice(0, 10);

    // Identify stuck issues: in_progress or in_review with no activeRun
    const stuckIssues = [...inProgress, ...inReview].filter((i) => !i.activeRun);

    // Build agent lookup
    const agentMap = {};
    agents.forEach((a) => (agentMap[a.id] = a));

    // Time since helper
    function timeSince(dateStr) {
      if (!dateStr) return "never";
      const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (secs < 60) return secs + "s ago";
      if (secs < 3600) return Math.floor(secs / 60) + "m ago";
      if (secs < 86400) return Math.floor(secs / 3600) + "h ago";
      return Math.floor(secs / 86400) + "d ago";
    }

    function issueRow(issue) {
      const agent = agentMap[issue.assigneeAgentId];
      const agentName = agent ? agent.name : "Unassigned";
      const isStuck = !issue.activeRun && (issue.status === "in_progress" || issue.status === "in_review");
      const isRunning = !!issue.activeRun;
      const isDone = issue.status === "done";
      const isCancelled = issue.status === "cancelled";
      function healthBadge() {
        if (isStuck) return '<span class="stuck-badge">STUCK — no agent running</span>';
        if (isRunning) return '<span class="running-badge">Agent working</span>';
        if (isDone) return '<span class="done-badge">Complete</span>';
        if (isCancelled) return '<span class="cancelled-badge">Cancelled</span>';
        if (issue.status === "todo") return '<span class="todo-badge">Waiting</span>';
        return '<span class="ok-badge">OK</span>';
      }
      return `
        <tr class="${isStuck ? "row-stuck" : ""}">
          <td><span class="admin-id">${issue.identifier || issue.id.slice(0, 8)}</span></td>
          <td class="admin-title-cell">${issue.title}</td>
          <td><span class="card-status status-${issue.status}">${issue.status.replace("_", " ")}</span></td>
          <td>${agentName}</td>
          <td>${timeSince(issue.updatedAt)}</td>
          <td>${healthBadge()}</td>
          <td class="admin-actions">
            <select class="status-select" data-issue-id="${issue.id}" onchange="changeStatus(this)">
              <option value="">Move to...</option>
              <option value="todo" ${issue.status === "todo" ? "disabled" : ""}>Todo</option>
              <option value="in_progress" ${issue.status === "in_progress" ? "disabled" : ""}>In Progress</option>
              <option value="in_review" ${issue.status === "in_review" ? "disabled" : ""}>In Review</option>
              <option value="done" ${issue.status === "done" ? "disabled" : ""}>Done</option>
              <option value="cancelled">Cancel</option>
            </select>
          </td>
        </tr>`;
    }

    const content = `
      <div class="admin-header">
        <h1 class="page-title">Admin Dashboard</h1>
        <p class="page-desc">Manage issues, unstick agents, and monitor the newsroom pipeline.</p>
      </div>

      ${stuckIssues.length > 0 ? `
      <section class="admin-alert">
        <div class="alert-icon">!</div>
        <div>
          <strong>${stuckIssues.length} stuck issue${stuckIssues.length > 1 ? "s" : ""}</strong> &mdash;
          These are in progress/review but have no active agent run.
          Wake an agent or move them manually.
        </div>
      </section>` : `
      <section class="admin-ok-banner">
        <strong>All clear</strong> &mdash; No stuck issues detected.
      </section>`}

      <section class="admin-section">
        <h2>Create Article</h2>
        <form class="create-article-form" onsubmit="createArticle(event)">
          <div class="form-row">
            <input type="text" id="article-topic" placeholder="Topic — e.g. ESP32-S3 camera streaming project" required class="form-input">
            <select id="article-agent" class="form-select">
              <option value="scout">Scout researches → Writer writes</option>
              <option value="writer">Writer writes directly</option>
            </select>
            <select id="article-priority" class="form-select form-select-sm">
              <option value="high">High</option>
              <option value="medium" selected>Medium</option>
              <option value="low">Low</option>
            </select>
            <button type="submit" class="btn btn-sm btn-primary">Create</button>
          </div>
        </form>
      </section>

      <section class="admin-section">
        <h2>Agents
          <button class="btn btn-sm" onclick="wakeAll()">Wake All Agents</button>
        </h2>
        <div class="admin-agents">
          ${agents.map((a) => {
            const lastRun = recentRuns.find((r) => r.agentId === a.id);
            return `
            <div class="admin-agent-card">
              <div class="admin-agent-top">
                <span class="agent-icon">${a.role === "ceo" ? "👑" : a.title?.includes("Scout") ? "🔍" : a.title?.includes("Writer") ? "✍️" : "📝"}</span>
                <div>
                  <strong>${a.name}</strong>
                  <div class="admin-agent-sub">${a.title || a.role}</div>
                </div>
                <span class="agent-status status-${a.status}">${a.status}</span>
              </div>
              <div class="admin-agent-meta">
                <span>Heartbeat: ${timeSince(a.lastHeartbeatAt)}</span>
                <span>Last run: ${lastRun ? (lastRun.status === "succeeded" ? "OK" : lastRun.status) + " " + timeSince(lastRun.finishedAt) : "none"}</span>
              </div>
              <button class="btn btn-sm btn-outline" onclick="wakeAgent('${a.id}', '${a.name}')">Wake Up</button>
            </div>`;
          }).join("")}
        </div>
      </section>

      <section class="admin-section">
        <h2>All Issues <span class="count">${allIssues.length}</span></h2>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Agent</th>
                <th>Updated</th>
                <th>Health</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${allIssues.map((i) => issueRow(i)).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="admin-section">
        <h2>Recent Heartbeat Runs</h2>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr><th>Agent</th><th>Status</th><th>Source</th><th>Started</th><th>Duration</th></tr>
            </thead>
            <tbody>
              ${recentRuns.map((r) => {
                const agent = agentMap[r.agentId];
                const dur = r.finishedAt && r.startedAt
                  ? Math.round((new Date(r.finishedAt) - new Date(r.startedAt)) / 1000) + "s"
                  : "...";
                return `
                <tr>
                  <td>${agent ? agent.name : r.agentId.slice(0, 8)}</td>
                  <td><span class="run-status run-${r.status}">${r.status}</span></td>
                  <td>${r.invocationSource}</td>
                  <td>${timeSince(r.startedAt)}</td>
                  <td>${dur}</td>
                </tr>`;
              }).join("") || "<tr><td colspan='5' class='empty-small'>No runs yet</td></tr>"}
            </tbody>
          </table>
        </div>
      </section>

      <div id="admin-toast" class="admin-toast"></div>

      <script>
        function showToast(msg, ok) {
          const t = document.getElementById('admin-toast');
          t.textContent = msg;
          t.className = 'admin-toast ' + (ok ? 'toast-ok' : 'toast-err') + ' toast-show';
          setTimeout(() => t.classList.remove('toast-show'), 3000);
        }

        async function changeStatus(select) {
          const id = select.dataset.issueId;
          const status = select.value;
          if (!status) return;
          select.disabled = true;
          try {
            const res = await fetch('/dashboard/api/issues/' + id + '/status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            });
            if (res.ok) {
              showToast('Issue moved to ' + status.replace('_', ' '), true);
              setTimeout(() => location.reload(), 800);
            } else {
              showToast('Failed to update issue', false);
              select.value = '';
              select.disabled = false;
            }
          } catch(e) {
            showToast('Error: ' + e.message, false);
            select.value = '';
            select.disabled = false;
          }
        }

        async function wakeAgent(id, name) {
          const btn = event.target;
          btn.disabled = true;
          btn.textContent = 'Waking...';
          try {
            const res = await fetch('/dashboard/api/agents/' + id + '/wakeup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
              showToast(name + ' woken up!', true);
              btn.textContent = 'Woken!';
              setTimeout(() => location.reload(), 2000);
            } else {
              const data = await res.json().catch(() => ({}));
              showToast('Failed: ' + (data.error || 'unknown error'), false);
              btn.disabled = false;
              btn.textContent = 'Wake Up';
            }
          } catch(e) {
            showToast('Error: ' + e.message, false);
            btn.disabled = false;
            btn.textContent = 'Wake Up';
          }
        }

        async function wakeAll() {
          const btn = event.target;
          btn.disabled = true;
          btn.textContent = 'Waking all...';
          const agents = ${JSON.stringify(agents.map((a) => ({ id: a.id, name: a.name })))};
          let ok = 0;
          for (const a of agents) {
            try {
              const res = await fetch('/dashboard/api/agents/' + a.id + '/wakeup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              if (res.ok) ok++;
            } catch(e) {}
          }
          showToast('Woke ' + ok + '/' + agents.length + ' agents', ok > 0);
          setTimeout(() => location.reload(), 2000);
        }

        const AGENT_IDS = ${JSON.stringify({
          scout: agents.find(a => a.name === "Scout")?.id,
          writer: agents.find(a => a.name === "Writer")?.id,
        })};

        async function createArticle(e) {
          e.preventDefault();
          const topic = document.getElementById('article-topic').value.trim();
          const mode = document.getElementById('article-agent').value;
          const priority = document.getElementById('article-priority').value;
          if (!topic) return;

          const btn = e.target.querySelector('button[type=submit]');
          btn.disabled = true;
          btn.textContent = 'Creating...';

          try {
            if (mode === 'scout') {
              // Create research task for Scout
              const res = await fetch('/dashboard/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: 'Scout: Research ' + topic,
                  description: 'Research this topic and create a detailed story brief with source URLs and images. Then create a Write task for the Writer agent.\\n\\nTopic: ' + topic,
                  assigneeAgentId: AGENT_IDS.scout,
                  priority
                })
              });
              if (!res.ok) throw new Error('Failed to create issue');
              // Wake Scout
              await fetch('/dashboard/api/agents/' + AGENT_IDS.scout + '/wakeup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }
              });
              showToast('Created research task & woke Scout', true);
            } else {
              // Create write task directly for Writer
              const res = await fetch('/dashboard/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: 'Write article on ' + topic,
                  description: 'Write a detailed, professional article about this topic. Search the web for real sources using web_search and fetch_url tools. Include source URLs and images.\\n\\nTopic: ' + topic,
                  assigneeAgentId: AGENT_IDS.writer,
                  priority
                })
              });
              if (!res.ok) throw new Error('Failed to create issue');
              // Wake Writer
              await fetch('/dashboard/api/agents/' + AGENT_IDS.writer + '/wakeup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }
              });
              showToast('Created article task & woke Writer', true);
            }
            document.getElementById('article-topic').value = '';
            setTimeout(() => location.reload(), 2000);
          } catch(err) {
            showToast('Error: ' + err.message, false);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Create';
          }
        }
      </script>`;

    res.send(layout("Dashboard", content, "dashboard"));
  } catch (e) {
    console.error("Admin error:", e);
    res.status(500).send(layout("Error", `<p class="error">Failed to load admin dashboard.</p>`));
  }
});

app.get("/about", (_req, res) => {
  const content = `
    <article class="article-full">
      <div class="article-header">
        <h1>About ESP32 Times</h1>
      </div>
      <div class="article-body prose">
        <p><strong>ESP32 Times</strong> is an AI-powered news site covering the ESP32 microcontroller ecosystem. Our entire newsroom is run by AI agents, each with a specific role:</p>

        <h3>👑 Chief Editor (CEO)</h3>
        <p>Sets editorial priorities, coordinates the team, and ensures quality standards across all content.</p>

        <h3>🔍 News Scout</h3>
        <p>Monitors the ESP32 ecosystem 24/7 — scanning GitHub releases, forums, community projects, and manufacturer announcements to find newsworthy stories.</p>

        <h3>✍️ Technical Writer</h3>
        <p>Transforms story briefs into clear, accurate, and engaging articles. Specializes in technical writing with code examples for Arduino, ESP-IDF, and MicroPython.</p>

        <h3>📝 Content Editor</h3>
        <p>Reviews every article for technical accuracy, clarity, completeness, and SEO before publication.</p>

        <h3>What We Cover</h3>
        <ul>
          <li><strong>New Hardware</strong> — ESP32-S3, ESP32-C6, ESP32-H2, and new development boards</li>
          <li><strong>Framework Updates</strong> — ESP-IDF, Arduino Core, MicroPython, CircuitPython</li>
          <li><strong>Community Projects</strong> — Interesting builds, libraries, and open-source tools</li>
          <li><strong>Tutorials</strong> — Getting started guides, advanced techniques, tips & tricks</li>
          <li><strong>Security</strong> — Advisories, best practices, vulnerability disclosures</li>
        </ul>

        <h3>How It Works</h3>
        <p>ESP32 Times is powered by <a href="https://github.com/paperclipai/paperclip" target="_blank">Paperclip</a>, an AI agent orchestration platform. Our agents run on <strong>Ollama</strong> with local LLMs, making the entire operation self-hosted and cost-free.</p>

        <p>Every article goes through a pipeline: <strong>Scout → Writer → Editor → Published</strong>. No human intervention required — though we welcome feedback!</p>
      </div>
    </article>`;

  res.send(layout("About", content, "about"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ESP32 Times running at http://0.0.0.0:${PORT}`);
  console.log(`Paperclip API: ${PAPERCLIP_API}`);
  console.log(`Company ID: ${COMPANY_ID}`);
});
