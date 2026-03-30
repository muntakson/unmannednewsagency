/**
 * Paperclip API tools for Ollama function calling.
 *
 * Defines tools that agents can use to interact with the Paperclip API
 * (list issues, update issues, create issues, add comments, etc.)
 * and executes them via HTTP against the local Paperclip server.
 */

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const PAPERCLIP_TOOLS: OllamaTool[] = [
  {
    type: "function",
    function: {
      name: "list_my_issues",
      description:
        "List ALL issues assigned to you across all statuses (todo, in_progress, in_review, done). Returns an array of issue objects.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_company_issues",
      description:
        "List all issues in the company, not just yours. Optionally filter by status. Useful for seeing the full pipeline.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              'Filter by status: "todo", "in_progress", "in_review", "done", or omit for all.',
            enum: ["todo", "in_progress", "in_review", "done"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_issue",
      description:
        "Get full details of a specific issue by ID, including its description and comments.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "The UUID of the issue to retrieve.",
          },
        },
        required: ["issue_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_issue",
      description:
        'Update an issue. Use this to change status (e.g. "todo" -> "in_progress" -> "in_review" -> "done"), update the description with article content, change the title, or reassign it.',
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "The UUID of the issue to update.",
          },
          status: {
            type: "string",
            description: "New status for the issue.",
            enum: ["todo", "in_progress", "in_review", "done"],
          },
          title: {
            type: "string",
            description: "New title for the issue.",
          },
          description: {
            type: "string",
            description:
              "New description/content for the issue. For articles, put the full markdown article content here.",
          },
          priority: {
            type: "string",
            description: "Priority level.",
            enum: ["critical", "high", "medium", "low"],
          },
          comment: {
            type: "string",
            description:
              "Optional comment to add alongside the update (e.g. explaining what you changed).",
          },
        },
        required: ["issue_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_issue",
      description:
        "Create a new issue/task. Use this to create story briefs, article tasks, or any other work items.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the new issue.",
          },
          description: {
            type: "string",
            description: "Full description or content of the issue.",
          },
          status: {
            type: "string",
            description: "Initial status (default: todo).",
            enum: ["todo", "in_progress", "in_review", "done"],
          },
          priority: {
            type: "string",
            description: "Priority level.",
            enum: ["critical", "high", "medium", "low"],
          },
          assignee_agent_id: {
            type: "string",
            description:
              "UUID of the agent to assign this issue to. Leave empty to leave unassigned.",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_comment",
      description:
        "Add a comment to an issue. Use for feedback, review notes, or progress updates.",
      parameters: {
        type: "object",
        properties: {
          issue_id: {
            type: "string",
            description: "The UUID of the issue to comment on.",
          },
          body: {
            type: "string",
            description: "The comment text (supports markdown).",
          },
        },
        required: ["issue_id", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_agents",
      description:
        "List all agents in the company. Returns agent names, roles, titles, and IDs. Useful for knowing who to assign tasks to.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for news and information. Returns article titles, URLs, and descriptions. Use this to research topics before writing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'The search query. Be specific, e.g. "solar chargers Africa 2026", "appropriate technology water pumping".',
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch a web page or RSS feed and return its text content. Use to read articles, blog posts, release notes, or RSS feeds.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL to fetch (must start with http:// or https://).",
          },
        },
        required: ["url"],
      },
    },
  },
];

interface ToolContext {
  apiUrl: string;
  agentId: string;
  companyId: string;
  runId: string;
}

async function apiCall(
  ctx: ToolContext,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const url = `${ctx.apiUrl}/api${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Paperclip-Run-Id": ctx.runId,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { error: `API ${res.status}: ${errText}`.slice(0, 500) };
  }
  return res.json();
}

function summarizeIssues(issues: unknown[]): unknown[] {
  return issues.map((i: any) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    priority: i.priority,
    assigneeAgentId: i.assigneeAgentId,
    description: i.description?.slice(0, 300) + (i.description?.length > 300 ? "..." : ""),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }));
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (toolName) {
      case "list_my_issues": {
        const path = `/companies/${ctx.companyId}/issues?assigneeAgentId=${ctx.agentId}&limit=50`;
        const result = await apiCall(ctx, "GET", path);
        if (Array.isArray(result)) return JSON.stringify(summarizeIssues(result));
        return JSON.stringify(result);
      }
      case "list_company_issues": {
        const status = args.status as string | undefined;
        let path = `/companies/${ctx.companyId}/issues?limit=50`;
        if (status) path += `&status=${status}`;
        const result = await apiCall(ctx, "GET", path);
        if (Array.isArray(result)) return JSON.stringify(summarizeIssues(result));
        return JSON.stringify(result);
      }
      case "get_issue": {
        const result = await apiCall(ctx, "GET", `/issues/${args.issue_id}`);
        return JSON.stringify(result);
      }
      case "update_issue": {
        const body: Record<string, unknown> = {};
        if (args.status) body.status = args.status;
        if (args.title) body.title = args.title;
        if (args.description) body.description = args.description;
        if (args.priority) body.priority = args.priority;
        if (args.comment) body.comment = args.comment;
        const result = await apiCall(ctx, "PATCH", `/issues/${args.issue_id}`, body);
        return JSON.stringify(result);
      }
      case "create_issue": {
        const body: Record<string, unknown> = {
          title: args.title,
          description: args.description,
          status: args.status || "todo",
        };
        if (args.priority) body.priority = args.priority;
        if (args.assignee_agent_id) body.assigneeAgentId = args.assignee_agent_id;
        const result = await apiCall(ctx, "POST", `/companies/${ctx.companyId}/issues`, body);
        return JSON.stringify(result);
      }
      case "add_comment": {
        const result = await apiCall(ctx, "POST", `/issues/${args.issue_id}/comments`, {
          body: args.body,
        });
        return JSON.stringify(result);
      }
      case "list_agents": {
        const result = await apiCall(ctx, "GET", `/companies/${ctx.companyId}/agents`);
        if (Array.isArray(result)) {
          return JSON.stringify(
            result.map((a: any) => ({
              id: a.id,
              name: a.name,
              role: a.role,
              title: a.title,
              status: a.status,
            })),
          );
        }
        return JSON.stringify(result);
      }
      case "web_search": {
        const query = String(args.query || "").toLowerCase();
        if (!query) return JSON.stringify({ error: "query is required" });

        const ESP32_COMPANY = "2eee727c-7dbb-44b1-91dd-ba948c6d7e0a";
        const isEsp32 = ctx.companyId === ESP32_COMPANY;

        const allResults: { title: string; url: string; source: string; snippet: string }[] = [];
        const fetchOpts = {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PaperclipBot/1.0)" },
          signal: AbortSignal.timeout(12_000),
        };

        if (isEsp32) {
          // ESP32 company: use curated RSS feeds
          const sources: { name: string; url: string; type: "rss" | "reddit" }[] = [
            { name: "Hackaday ESP32", url: "https://hackaday.com/tag/esp32/feed/", type: "rss" },
            { name: "Reddit r/esp32", url: "https://www.reddit.com/r/esp32/hot.json?limit=15", type: "reddit" },
            { name: "Hackaday Front Page", url: "https://hackaday.com/feed/", type: "rss" },
          ];

          const fetches = sources.map(async (src) => {
            try {
              const res = await fetch(src.url, fetchOpts);
              if (!res.ok) return;
              const text = await res.text();

              if (src.type === "reddit") {
                const data = JSON.parse(text);
                for (const post of (data?.data?.children || []).slice(0, 15)) {
                  const p = post.data;
                  if (!p || p.stickied) continue;
                  allResults.push({
                    title: p.title || "",
                    url: p.url?.startsWith("http") ? p.url : `https://www.reddit.com${p.permalink}`,
                    source: src.name,
                    snippet: (p.selftext || "").slice(0, 200),
                  });
                }
              } else {
                const itemRegex = /<item[\s>][\s\S]*?<\/item>/gi;
                let itemMatch;
                while ((itemMatch = itemRegex.exec(text)) !== null && allResults.length < 30) {
                  const xml = itemMatch[0];
                  const title = (xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || "")
                    .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#8211;/g, "–").replace(/&#8217;/g, "'").trim();
                  const link = (xml.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] || "")
                    .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
                  const desc = (xml.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || "")
                    .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#8217;/g, "'").trim();
                  if (title) {
                    allResults.push({ title, url: link, source: src.name, snippet: desc.slice(0, 200) });
                  }
                }
              }
            } catch {
              // Skip failed sources
            }
          });

          await Promise.all(fetches);

          // Filter by keywords
          const keywords = query.split(/\s+/).filter((w) => w.length > 2);
          let filtered = allResults;
          if (keywords.length > 0 && !query.includes("latest") && !query.includes("news")) {
            filtered = allResults.filter((r) => {
              const text = `${r.title} ${r.snippet}`.toLowerCase();
              return keywords.some((kw) => text.includes(kw));
            });
          }
          if (filtered.length === 0) filtered = allResults;

          return JSON.stringify({
            query,
            results: filtered.slice(0, 12),
            sources_checked: sources.map((s) => s.name),
          });
        }

        // General web search via DuckDuckGo HTML
        try {
          const ddgUrl = "https://html.duckduckgo.com/html/";
          const formBody = `q=${encodeURIComponent(args.query as string)}`;
          const res = await fetch(ddgUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            body: formBody,
            signal: AbortSignal.timeout(12_000),
          });
          if (!res.ok) {
            return JSON.stringify({ query, results: [], error: `DuckDuckGo returned ${res.status}` });
          }
          const html = await res.text();

          // Parse DuckDuckGo HTML results
          const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;
          while ((match = resultRegex.exec(html)) !== null && allResults.length < 10) {
            let href = match[1];
            // DuckDuckGo wraps URLs in a redirect; extract the real URL
            const uddgMatch = href.match(/uddg=([^&]+)/);
            if (uddgMatch) href = decodeURIComponent(uddgMatch[1]);
            const title = match[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
            const snippet = match[3].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
            if (title && href) {
              allResults.push({ title, url: href, source: "DuckDuckGo", snippet: snippet.slice(0, 200) });
            }
          }

          // Fallback: try simpler pattern if regex above didn't match
          if (allResults.length === 0) {
            const simpleRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let simpleMatch;
            while ((simpleMatch = simpleRegex.exec(html)) !== null && allResults.length < 10) {
              let href = simpleMatch[1];
              const uddgMatch = href.match(/uddg=([^&]+)/);
              if (uddgMatch) href = decodeURIComponent(uddgMatch[1]);
              const title = simpleMatch[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
              if (title && href) {
                allResults.push({ title, url: href, source: "DuckDuckGo", snippet: "" });
              }
            }
          }

          return JSON.stringify({
            query,
            results: allResults.slice(0, 10),
            sources_checked: ["DuckDuckGo"],
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ query, results: [], error: `Search failed: ${message}` });
        }
      }
      case "fetch_url": {
        const url = String(args.url || "");
        if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
          return JSON.stringify({ error: "A valid http:// or https:// URL is required" });
        }
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; PaperclipBot/1.0)",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(15_000),
            redirect: "follow",
          });
          if (!res.ok) return JSON.stringify({ error: `Fetch returned ${res.status}` });
          const contentType = res.headers.get("content-type") || "";
          const text = await res.text();

          // For RSS/XML feeds, extract items
          if (contentType.includes("xml") || contentType.includes("rss") || text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<rss") || text.trimStart().startsWith("<feed")) {
            const items: { title: string; link: string; description: string }[] = [];
            const itemRegex = /<item[\s>][\s\S]*?<\/item>/gi;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(text)) !== null && items.length < 10) {
              const itemXml = itemMatch[0];
              const t = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
              const l = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
              const d = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim() || "";
              if (t) items.push({ title: t, link: l, description: d.slice(0, 300) });
            }
            // Also try Atom <entry> format
            if (items.length === 0) {
              const entryRegex = /<entry[\s>][\s\S]*?<\/entry>/gi;
              let entryMatch;
              while ((entryMatch = entryRegex.exec(text)) !== null && items.length < 10) {
                const entryXml = entryMatch[0];
                const t = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
                const lMatch = entryXml.match(/<link[^>]*href="([^"]*)"/);
                const l = lMatch ? lMatch[1] : "";
                const d = entryXml.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim() || "";
                if (t) items.push({ title: t, link: l, description: d.slice(0, 300) });
              }
            }
            return JSON.stringify({ url, type: "rss", items });
          }

          // For HTML, extract text content
          // Remove scripts, styles, nav, footer
          let cleaned = text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<nav[\s\S]*?<\/nav>/gi, "")
            .replace(/<footer[\s\S]*?<\/footer>/gi, "")
            .replace(/<header[\s\S]*?<\/header>/gi, "");

          // Extract title
          const pageTitle = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";

          // Extract og:image or twitter:image
          const ogImage = text.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
            || text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1]
            || text.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1]
            || "";

          // Get text from body or main content
          const bodyMatch = cleaned.match(/<(?:main|article|body)[^>]*>([\s\S]*?)<\/(?:main|article|body)>/i);
          const bodyHtml = bodyMatch ? bodyMatch[1] : cleaned;

          // Strip tags and clean up
          const plainText = bodyHtml
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();

          // Limit to ~4000 chars to avoid context overflow
          const result: Record<string, unknown> = {
            url,
            type: "html",
            title: pageTitle,
            content: plainText.slice(0, 4000),
          };
          result.source_note = "IMPORTANT: Always include this at the end of your article/brief:\n\nSource: [" + pageTitle + "](" + url + ")";
          if (ogImage) {
            result.image = ogImage;
            result.source_note += "\n\n![Article photo](" + ogImage + ")\n*Image: [" + new URL(url).hostname + "](" + url + ")*";
          }
          return JSON.stringify(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return JSON.stringify({ error: `Fetch failed: ${message}` });
        }
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Tool execution failed: ${message}` });
  }
}
