import express from "express";
import { marked } from "marked";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3300;
const PAPERCLIP_API = process.env.PAPERCLIP_API || "http://127.0.0.1:3100/api";
const COMPANY_ID = process.env.COMPANY_ID || "";

if (!COMPANY_ID) {
  console.error("ERROR: COMPANY_ID environment variable is required. Run scripts/setup-approtechnews.sh first.");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));

// Fetch issues from Paperclip
async function fetchIssues(status) {
  const url = `${PAPERCLIP_API}/companies/${COMPANY_ID}/issues?status=${status}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

async function fetchIssue(id) {
  const res = await fetch(`${PAPERCLIP_API}/issues/${id}`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchAgents() {
  const res = await fetch(`${PAPERCLIP_API}/companies/${COMPANY_ID}/agents`);
  if (!res.ok) return [];
  return res.json();
}

async function getArticles() {
  const [done, inReview, inProgress] = await Promise.all([
    fetchIssues("done"),
    fetchIssues("in_review"),
    fetchIssues("in_progress"),
  ]);
  const isArticle = (issue) =>
    issue.title?.toLowerCase().includes("write") ||
    issue.title?.toLowerCase().includes("article") ||
    issue.title?.toLowerCase().includes("review") ||
    issue.title?.toLowerCase().includes("appropriate") ||
    issue.title?.toLowerCase().includes("technology") ||
    issue.title?.toLowerCase().includes("적정") ||
    issue.description?.length > 200;

  return {
    published: done.filter(isArticle),
    drafts: [...inReview, ...inProgress].filter(isArticle),
    all: [...done, ...inReview, ...inProgress],
  };
}

function layout(title, content, activePage = "home") {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Approtech Times</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=1">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌱</text></svg>">
</head>
<body>
  <header>
    <div class="container">
      <div class="header-inner">
        <a href="/" class="logo">
          <span class="logo-icon">🌱</span>
          <div>
            <span class="logo-text">Approtech Times</span>
            <span class="logo-sub-kr">적정기술 타임즈</span>
            <span class="logo-sub">AI 뉴스 · Appropriate Technology News</span>
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
          <span class="logo-icon">🌱</span> Approtech Times
          <span class="footer-sep">·</span>
          AI-powered news about appropriate technology for a better world
        </div>
        <div class="footer-meta">
          Powered by <a href="https://github.com/paperclipai/paperclip" target="_blank">Paperclip AI</a> ·
          Agents running on Groq (llama-3.3-70b-versatile)
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function extractSummary(desc, maxLen = 200) {
  if (!desc) return "No summary available.";
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

function getCategory(issue) {
  const t = (issue.title || "").toLowerCase();
  const d = (issue.description || "").toLowerCase();
  if (t.includes("water") || d.includes("water") || d.includes("물") || d.includes("정수")) return "Water";
  if (t.includes("energy") || d.includes("solar") || d.includes("에너지") || d.includes("태양")) return "Energy";
  if (t.includes("health") || d.includes("health") || d.includes("의료") || d.includes("보건")) return "Health";
  if (t.includes("agriculture") || d.includes("farming") || d.includes("농업") || d.includes("농촌")) return "Agriculture";
  if (t.includes("ai") || d.includes("artificial intelligence") || d.includes("인공지능") || d.includes("machine learning")) return "AI";
  if (t.includes("education") || d.includes("education") || d.includes("교육")) return "Education";
  if (t.includes("housing") || d.includes("shelter") || d.includes("주거") || d.includes("3d print")) return "Housing";
  if (t.includes("tutorial") || d.includes("tutorial") || d.includes("how to") || t.includes("가이드")) return "Guide";
  return "News";
}

function categoryColor(cat) {
  const colors = {
    News: "#22c55e",
    Guide: "#3b82f6",
    Water: "#06b6d4",
    Energy: "#f59e0b",
    Health: "#ef4444",
    Agriculture: "#84cc16",
    AI: "#8b5cf6",
    Education: "#ec4899",
    Housing: "#f97316",
  };
  return colors[cat] || "#6b7280";
}

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

async function fetchArticleMeta(issueId) {
  try {
    const [runsRes, agentsRes] = await Promise.all([
      fetch(`${PAPERCLIP_API}/companies/${COMPANY_ID}/heartbeat-runs?limit=200`),
      fetchAgents(),
    ]);
    if (!runsRes.ok) return null;
    const allRuns = await runsRes.json();
    const agentMap = {};
    for (const a of agentsRes) agentMap[a.id] = a;

    const related = [];
    for (const run of allRuns) {
      const stdout = run.resultJson?.stdout || "";
      const mentionsIssue = stdout.includes(issueId);
      if (!mentionsIssue) continue;

      const sources = [];
      const toolCalls = [];
      for (const line of stdout.split("\n")) {
        try {
          const ev = JSON.parse(line);
          if (ev.type === "tool_call") {
            toolCalls.push(ev);
            if (ev.name === "fetch_url" && ev.arguments?.url) {
              sources.push(ev.arguments.url);
            }
          }
        } catch {}
      }

      const agent = agentMap[run.agentId];
      const duration = run.startedAt && run.finishedAt
        ? Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000)
        : null;

      related.push({
        agentName: agent?.name || "Unknown",
        agentTitle: agent?.title || "",
        status: run.status,
        source: run.invocationSource,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        duration,
        sources,
      });
    }

    // Find next scheduled heartbeat
    let nextHeartbeat = null;
    for (const a of agentsRes) {
      const rc = a.runtimeConfig?.heartbeat || {};
      if (!rc.enabled || !rc.intervalSec) continue;
      if (a.name !== "Scout") continue;
      const last = new Date(a.lastHeartbeatAt || a.createdAt);
      const next = new Date(last.getTime() + rc.intervalSec * 1000);
      nextHeartbeat = next.toISOString();
    }

    return { related, nextHeartbeat };
  } catch {
    return null;
  }
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

function fmtDuration(sec) {
  if (!sec) return "—";
  if (sec < 60) return sec + "s";
  return Math.floor(sec / 60) + "m " + (sec % 60) + "s";
}

function renderArticleMeta(issueId, issue, meta) {
  if (!meta || meta.related.length === 0) return "";

  const rows = meta.related.map(r => `
    <tr>
      <td>${r.agentName} <span class="meta-dim">(${r.agentTitle})</span></td>
      <td>${r.source}</td>
      <td>${fmtTime(r.startedAt)}</td>
      <td>${fmtDuration(r.duration)}</td>
      <td class="status-${r.status}">${r.status}</td>
    </tr>
  `).join("");

  const allSources = [...new Set(meta.related.flatMap(r => r.sources))];
  const sourcesList = allSources.length > 0
    ? allSources.map(u => `<li><a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 60) + "…" : u}</a></li>`).join("")
    : "<li>No URLs fetched</li>";

  return `
    <div class="article-meta-panel">
      <button class="meta-toggle" onclick="this.parentElement.classList.toggle('open')">
        <span class="meta-toggle-icon">ℹ️</span> Article Info
        <span class="meta-toggle-arrow">▼</span>
      </button>
      <div class="meta-content">
        <table class="meta-table">
          <tr><th>Article ID</th><td><code>${issueId}</code></td></tr>
          <tr><th>Created</th><td>${fmtTime(issue.createdAt)}</td></tr>
          <tr><th>Completed</th><td>${fmtTime(issue.completedAt || issue.updatedAt)}</td></tr>
          <tr><th>Next Scout Run</th><td>${meta.nextHeartbeat ? fmtTime(meta.nextHeartbeat) : "—"}</td></tr>
        </table>

        <h4>Agent Runs</h4>
        <table class="meta-runs">
          <thead><tr><th>Agent</th><th>Trigger</th><th>Started</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <h4>Sources Fetched</h4>
        <ul class="meta-sources">${sourcesList}</ul>
      </div>
    </div>`;
}

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

function extractImage(desc) {
  if (!desc) return null;
  const mdMatch = desc.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (mdMatch) return mdMatch[1];
  const urlMatch = desc.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp))/i);
  return urlMatch ? urlMatch[1] : null;
}

function extractSource(desc) {
  if (!desc) return null;
  const srcMatch = desc.match(/Source:\s*\[([^\]]+)\]\(([^)]+)\)/i);
  if (srcMatch) return { title: srcMatch[1], url: srcMatch[2] };
  const notImage = (url) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url);
  const allUrls = [...desc.matchAll(/https?:\/\/(?:[\w-]+\.)+[\w-]+\/[^\s"')]+/g)];
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

function extractImageCredit(desc) {
  if (!desc) return null;
  const creditMatch = desc.match(/\*Image:\s*\[([^\]]+)\]\(([^)]+)\)\*/i);
  if (creditMatch) return { domain: creditMatch[1], url: creditMatch[2] };
  const img = extractImage(desc);
  if (img) {
    try {
      const hostname = new URL(img).hostname.replace("www.", "");
      return { domain: hostname, url: img };
    } catch {}
  }
  return null;
}

function cleanIssueTitle(title) {
  return (title || "")
    .replace(/^(Write|Scout|CEO|Editor):\s*/i, "")
    .replace(/^Write\s*—\s*/i, "")
    .replace(/^Write\s+article\s+on\s+/i, "")
    .replace(/^Research\s+/i, "")
    .trim();
}

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
    const [{ published, drafts }, tokenUsage] = await Promise.all([
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
        <h1>Technology for Everyone, Everywhere</h1>
        <p class="hero-sub">AI가 취재하는 적정기술 뉴스 — 가난한 이웃을 돕는 기술, AI와 개발도상국, 지속가능한 혁신에 대한 소식을 AI 뉴스룸이 전합니다.</p>
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
          <div class="empty-icon">🌍</div>
          <h2>Newsroom is warming up</h2>
          <p>Our AI agents are scouting for appropriate technology stories — innovations that help communities in need. Check back soon!</p>
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
    const [issue, tokenUsage, articleMeta] = await Promise.all([
      fetchIssue(req.params.id),
      fetchTokenUsageByIssue(),
      fetchArticleMeta(req.params.id),
    ]);
    if (!issue) return res.status(404).send(layout("Not Found", `<h1>Article not found</h1>`));

    const cat = getCategory(issue);
    const cleanTitle = cleanIssueTitle(issue.title);
    const tokenInfo = tokenUsage[issue.id];
    const source = extractSource(issue.description);
    const imageCredit = extractImageCredit(issue.description);
    const heroImage = extractImage(issue.description);

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
          ${tokenInfo ? `<div class="article-token-info">Groq: ${((tokenInfo.inputTokens + tokenInfo.outputTokens) / 1000).toFixed(1)}k tokens (${(tokenInfo.inputTokens / 1000).toFixed(1)}k in / ${(tokenInfo.outputTokens / 1000).toFixed(1)}k out) · ${((tokenInfo.inputTokens / 1_000_000) * GROQ_INPUT_COST_PER_M + (tokenInfo.outputTokens / 1_000_000) * GROQ_OUTPUT_COST_PER_M) < 0.01 ? "<$0.01" : "$" + ((tokenInfo.inputTokens / 1_000_000) * GROQ_INPUT_COST_PER_M + (tokenInfo.outputTokens / 1_000_000) * GROQ_OUTPUT_COST_PER_M).toFixed(2)}</div>` : ""}
        </div>
        ${renderArticleMeta(req.params.id, issue, articleMeta)}
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
      <p class="page-desc">Meet our AI agents covering appropriate technology stories worldwide.</p>

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

    const stuckIssues = [...inProgress, ...inReview].filter((i) => !i.activeRun);

    const agentMap = {};
    agents.forEach((a) => (agentMap[a.id] = a));

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
        if (isStuck) return '<span class="stuck-badge">STUCK</span>';
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
        <p class="page-desc">Manage articles, agents, and the Approtech Times pipeline.</p>
      </div>

      ${stuckIssues.length > 0 ? `
      <section class="admin-alert">
        <div class="alert-icon">!</div>
        <div>
          <strong>${stuckIssues.length} stuck issue${stuckIssues.length > 1 ? "s" : ""}</strong> &mdash;
          These are in progress/review but have no active agent run.
        </div>
      </section>` : `
      <section class="admin-ok-banner">
        <strong>All clear</strong> &mdash; No stuck issues detected.
      </section>`}

      <section class="admin-section">
        <h2>Create Article</h2>
        <form class="create-article-form" onsubmit="createArticle(event)">
          <div class="form-row">
            <input type="text" id="article-topic" placeholder="Topic — e.g. Solar water purifier for rural villages" required class="form-input">
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
              <tr><th>ID</th><th>Title</th><th>Status</th><th>Agent</th><th>Updated</th><th>Health</th><th>Actions</th></tr>
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
          const id = select.dataset.issueId, status = select.value;
          if (!status) return;
          select.disabled = true;
          try {
            const res = await fetch('/dashboard/api/issues/' + id + '/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
            if (res.ok) { showToast('Issue moved to ' + status.replace('_', ' '), true); setTimeout(() => location.reload(), 800); }
            else { showToast('Failed to update issue', false); select.value = ''; select.disabled = false; }
          } catch(e) { showToast('Error: ' + e.message, false); select.value = ''; select.disabled = false; }
        }
        async function wakeAgent(id, name) {
          const btn = event.target; btn.disabled = true; btn.textContent = 'Waking...';
          try {
            const res = await fetch('/dashboard/api/agents/' + id + '/wakeup', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            if (res.ok) { showToast(name + ' woken up!', true); btn.textContent = 'Woken!'; setTimeout(() => location.reload(), 2000); }
            else { showToast('Failed', false); btn.disabled = false; btn.textContent = 'Wake Up'; }
          } catch(e) { showToast('Error: ' + e.message, false); btn.disabled = false; btn.textContent = 'Wake Up'; }
        }
        async function wakeAll() {
          const btn = event.target; btn.disabled = true; btn.textContent = 'Waking all...';
          const agents = ${JSON.stringify(agents.map((a) => ({ id: a.id, name: a.name })))};
          let ok = 0;
          for (const a of agents) { try { const res = await fetch('/dashboard/api/agents/' + a.id + '/wakeup', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); if (res.ok) ok++; } catch(e) {} }
          showToast('Woke ' + ok + '/' + agents.length + ' agents', ok > 0);
          setTimeout(() => location.reload(), 2000);
        }
        const AGENT_IDS = ${JSON.stringify({ scout: agents.find(a => a.name === "Scout")?.id, writer: agents.find(a => a.name === "Writer")?.id })};
        async function createArticle(e) {
          e.preventDefault();
          const topic = document.getElementById('article-topic').value.trim();
          const mode = document.getElementById('article-agent').value;
          const priority = document.getElementById('article-priority').value;
          if (!topic) return;
          const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating...';
          try {
            if (mode === 'scout') {
              const res = await fetch('/dashboard/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Scout: Research ' + topic, description: 'Research this appropriate technology topic and create a detailed story brief with source URLs and images. Then create a Write task for the Writer agent.\\n\\nTopic: ' + topic, assigneeAgentId: AGENT_IDS.scout, priority }) });
              if (!res.ok) throw new Error('Failed to create issue');
              await fetch('/dashboard/api/agents/' + AGENT_IDS.scout + '/wakeup', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              showToast('Created research task & woke Scout', true);
            } else {
              const res = await fetch('/dashboard/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Write article on ' + topic, description: 'Write a detailed article about this appropriate technology topic. Use fetch_url to read sources. Include source URLs and images.\\n\\nTopic: ' + topic, assigneeAgentId: AGENT_IDS.writer, priority }) });
              if (!res.ok) throw new Error('Failed to create issue');
              await fetch('/dashboard/api/agents/' + AGENT_IDS.writer + '/wakeup', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              showToast('Created article task & woke Writer', true);
            }
            document.getElementById('article-topic').value = '';
            setTimeout(() => location.reload(), 2000);
          } catch(err) { showToast('Error: ' + err.message, false); } finally { btn.disabled = false; btn.textContent = 'Create'; }
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
        <h1>About Approtech Times (적정기술 타임즈)</h1>
      </div>
      <div class="article-body prose">
        <p><strong>Approtech Times</strong> is an AI-powered news agency covering <strong>appropriate technology (적정기술)</strong> — innovations designed to improve the lives of people in developing regions and underserved communities worldwide.</p>

        <h3>👑 Chief Editor (CEO)</h3>
        <p>Sets editorial priorities, coordinates the team, and ensures balanced coverage of domestic Korean and international stories.</p>

        <h3>🔍 News Scout</h3>
        <p>Monitors appropriate technology sources worldwide — Korean organizations (적정기술학회, 국경없는과학자회, 나눔과기술), international development news (MIT D-Lab, Engineering for Change, Practical Action), and tech-for-good communities.</p>

        <h3>✍️ Technical Writer</h3>
        <p>Transforms story briefs into clear, engaging articles accessible to general audiences.</p>

        <h3>📝 Content Editor</h3>
        <p>Reviews every article for accuracy, completeness, and readability before publication.</p>

        <h3>What We Cover</h3>
        <ul>
          <li><strong>Water & Sanitation</strong> — Low-cost water purification, well drilling, sanitation systems</li>
          <li><strong>Energy</strong> — Solar panels, biogas, micro-hydro, off-grid solutions</li>
          <li><strong>Health</strong> — Telemedicine, low-cost medical devices, AI diagnostics for remote areas</li>
          <li><strong>Agriculture</strong> — Precision farming for smallholders, drought-resistant techniques</li>
          <li><strong>AI for Development</strong> — How AI and machine learning help address poverty and inequality</li>
          <li><strong>Education</strong> — EdTech for underserved schools, offline learning tools</li>
          <li><strong>Housing</strong> — Affordable construction, 3D-printed homes, disaster-resilient shelters</li>
        </ul>

        <h3>Our Sources</h3>
        <ul>
          <li><strong>Korean</strong> — 적정기술학회 (appropriate.or.kr), 국경없는과학자회, 나눔과기술 (stiweb.org)</li>
          <li><strong>International</strong> — MIT D-Lab, Engineering for Change, Practical Action, IDRC, World Bank, Borgen Project</li>
          <li><strong>Communities</strong> — Hackaday, Reddit r/AppropriateTehnology</li>
        </ul>

        <h3>How It Works</h3>
        <p>Approtech Times is powered by <a href="https://github.com/paperclipai/paperclip" target="_blank">Paperclip</a>, an AI agent orchestration platform. Our agents run on <strong>Groq</strong> with llama-3.3-70b-versatile.</p>
        <p>Every article goes through a pipeline: <strong>Scout → Writer → Editor → Published</strong>.</p>
      </div>
    </article>`;

  res.send(layout("About", content, "about"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Approtech Times running at http://0.0.0.0:${PORT}`);
  console.log(`Paperclip API: ${PAPERCLIP_API}`);
  console.log(`Company ID: ${COMPANY_ID}`);
});
