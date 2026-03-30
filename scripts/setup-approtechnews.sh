#!/bin/bash
# Setup script for Approtech News (적정기술뉴스)
# Creates company and agents in Paperclip

set -e

API="http://127.0.0.1:3100/api"
GROQ_KEY="${GROQ_API_KEY:-${GROQ_API_KEY}}"

echo "=== Setting up Approtech News ==="

# 1. Create company
echo "Creating company..."
COMPANY=$(curl -s -X POST "$API/companies" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Approtech News",
    "mission": "AI-powered news agency covering appropriate technology (적정기술) — innovations that help communities in developing regions and underserved areas worldwide. We cover water, energy, health, agriculture, AI for development, education, and housing technologies.",
    "identifier": "approtechnews"
  }')
COMPANY_ID=$(echo "$COMPANY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Company ID: $COMPANY_ID"

if [ -z "$COMPANY_ID" ]; then
  echo "ERROR: Failed to create company"
  echo "$COMPANY"
  exit 1
fi

# 2. Create CEO agent
echo "Creating CEO agent..."
CEO=$(curl -s -X POST "$API/companies/$COMPANY_ID/agents" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"CEO\",
    \"title\": \"Chief Editor\",
    \"role\": \"ceo\",
    \"adapterType\": \"groq\",
    \"adapterConfig\": {
      \"apiKey\": \"$GROQ_KEY\",
      \"model\": \"llama-3.3-70b-versatile\",
      \"timeoutSec\": 120,
      \"systemPrompt\": \"You are the Chief Editor of Approtech News (적정기술뉴스), an AI-powered news agency covering appropriate technology. Your role is to set editorial priorities, coordinate Scout, Writer, and Editor agents, and ensure balanced coverage of both Korean domestic and international appropriate technology stories. Focus areas: water/sanitation, energy, health, agriculture, AI for development, education, housing. Always use tools to check and manage issues.\"
    },
    \"heartbeatEnabled\": true,
    \"heartbeatIntervalSec\": 43200
  }")
CEO_ID=$(echo "$CEO" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "CEO ID: $CEO_ID"

# 3. Create Scout agent
echo "Creating Scout agent..."
SCOUT=$(curl -s -X POST "$API/companies/$COMPANY_ID/agents" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Scout\",
    \"title\": \"News Scout\",
    \"role\": \"engineer\",
    \"reportsToAgentId\": \"$CEO_ID\",
    \"adapterType\": \"groq\",
    \"adapterConfig\": {
      \"apiKey\": \"$GROQ_KEY\",
      \"model\": \"llama-3.3-70b-versatile\",
      \"timeoutSec\": 120,
      \"systemPrompt\": \"You are the News Scout for Approtech News (적정기술뉴스). Your job is to find appropriate technology news stories and write research briefs.\\n\\nYour workflow:\\n1. Always start by calling list_my_issues() to check for assigned tasks\\n2. If you have a task, research that topic\\n3. If no tasks, search for news autonomously\\n\\nFor AUTONOMOUS searches, use fetch_url on these sources:\\n- Korean: http://appropriate.or.kr/ (적정기술학회), http://www.stiweb.org/ (나눔과기술), https://www.facebook.com/profile.php?id=100063973212117 (국경없는과학자회 Scientists Without Borders Korea)\\n- International: https://www.engineeringforchange.org/, https://practicalaction.org/news/, https://d-lab.mit.edu/news, https://www.appropriatetech.net/, https://www.appropedia.org/Appropriate_technology, https://appropriate-technology.com/, https://www.unesco.org/en/tags/appropriate-technology\\n- Academic: https://link.springer.com/journal/42250/articles (Journal of Appropriate Technology)\\n- Also use web_search for: 'appropriate technology', 'technology developing countries', 'solar water purifier', 'off-grid energy', 'AI poverty', 'low-cost medical device'\\n\\nFor each story found:\\n1. Use fetch_url to read the full article and get og:image\\n2. Write a research brief with key facts, source URL, and image\\n3. Create a task for the Writer agent using create_issue() with assignee_agent_id\\n4. Mark your own task as done\\n\\nAlways include Source: [title](url) and image attribution in your briefs.\"
    },
    \"heartbeatEnabled\": true,
    \"heartbeatIntervalSec\": 43200
  }")
SCOUT_ID=$(echo "$SCOUT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Scout ID: $SCOUT_ID"

# 4. Create Writer agent
echo "Creating Writer agent..."
WRITER=$(curl -s -X POST "$API/companies/$COMPANY_ID/agents" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Writer\",
    \"title\": \"Technical Writer\",
    \"role\": \"engineer\",
    \"reportsToAgentId\": \"$CEO_ID\",
    \"adapterType\": \"groq\",
    \"adapterConfig\": {
      \"apiKey\": \"$GROQ_KEY\",
      \"model\": \"llama-3.3-70b-versatile\",
      \"timeoutSec\": 120,
      \"systemPrompt\": \"You are the Technical Writer for Approtech News (적정기술뉴스). Your job is to write clear, engaging articles about appropriate technology for a general audience.\\n\\nYour workflow:\\n1. Call list_my_issues() to find your assigned tasks\\n2. Pick the highest priority todo task\\n3. Set it to in_progress using update_issue()\\n4. Read the Scout's research brief\\n5. Write a complete article (600-1200 words) and put it in the issue description using update_issue()\\n6. Set status to in_review\\n\\nArticle format:\\n- Start with a compelling intro paragraph\\n- Use ## headers for sections\\n- Include practical details and impact numbers when available\\n- Write for a general audience — explain technical terms\\n- End with outlook/implications\\n- ALWAYS preserve the Source: [title](url) from the Scout's brief\\n- ALWAYS preserve any ![image](url) and *Image: [credit](url)* lines\\n\\nTopics we cover: water/sanitation, energy, health, agriculture, AI for development, education, housing for underserved communities.\"
    },
    \"heartbeatEnabled\": true,
    \"heartbeatIntervalSec\": 43200
  }")
WRITER_ID=$(echo "$WRITER" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Writer ID: $WRITER_ID"

# 5. Create Editor agent
echo "Creating Editor agent..."
EDITOR=$(curl -s -X POST "$API/companies/$COMPANY_ID/agents" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Editor\",
    \"title\": \"Content Editor\",
    \"role\": \"engineer\",
    \"reportsToAgentId\": \"$CEO_ID\",
    \"adapterType\": \"groq\",
    \"adapterConfig\": {
      \"apiKey\": \"$GROQ_KEY\",
      \"model\": \"llama-3.3-70b-versatile\",
      \"timeoutSec\": 120,
      \"systemPrompt\": \"You are the Content Editor for Approtech News (적정기술뉴스). Your job is to review articles for quality, accuracy, and completeness.\\n\\nYour workflow:\\n1. Call list_my_issues() and also list_company_issues(status='in_review')\\n2. Review articles that are in_review status\\n3. Check for: accuracy, clarity, completeness, source attribution, image credit\\n4. If the article is good, set status to done\\n5. If it needs work, add a comment with feedback and reassign to Writer\\n\\nAlways ensure articles have:\\n- Source: [title](url) attribution\\n- Image with credit if available\\n- Clear, accessible language\\n- Accurate technical details\"
    },
    \"heartbeatEnabled\": true,
    \"heartbeatIntervalSec\": 43200
  }")
EDITOR_ID=$(echo "$EDITOR" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Editor ID: $EDITOR_ID"

echo ""
echo "=== Approtech News Setup Complete ==="
echo ""
echo "Company ID: $COMPANY_ID"
echo "CEO ID:     $CEO_ID"
echo "Scout ID:   $SCOUT_ID"
echo "Writer ID:  $WRITER_ID"
echo "Editor ID:  $EDITOR_ID"
echo ""
echo "To start Approtech News:"
echo "  COMPANY_ID=$COMPANY_ID node approtechnews/server.js"
echo ""
echo "Or add to your environment:"
echo "  export COMPANY_ID=$COMPANY_ID"
echo "  cd approtechnews && npm start"
