#!/usr/bin/env python3
"""Switch all ESP32 Times + Approtech News agents from Groq to Ollama local (qwen3.5:9b)"""

import json
import urllib.request

API = "http://localhost:3100/api/agents"
MODEL = "qwen3.5:9b"
BASE_URL = "http://localhost:11434"

agents = {
    # ESP32 Times
    "1054dee8-8a01-4ed4-bed1-a0ed5eda9ca8": {"name": "ESP32 Scout", "timeout": 300},
    "8917d736-1832-4d4c-9e04-d4a52330f7d1": {"name": "ESP32 Writer", "timeout": 300},
    "7f26ec4d-2c98-4008-ace6-5c907471f3d2": {"name": "ESP32 Editor", "timeout": 300},
    "412fb60f-6bb0-4639-8976-9f5446d66c80": {"name": "ESP32 CEO", "timeout": 300},
    # Approtech Times
    "aa92e04b-d9eb-4b7e-be0e-8f6e24d094a0": {"name": "Appro Scout", "timeout": 120},
    "40f4b1d6-141a-4395-b5a6-b40b5d8eb161": {"name": "Appro Writer", "timeout": 120},
    "aa938b43-1b91-4d54-af07-6c5b107dc879": {"name": "Appro Editor", "timeout": 120},
    "520608b9-9b23-4edf-8a36-3f9682ac94d8": {"name": "Appro CEO", "timeout": 120},
}

for agent_id, info in agents.items():
    # Get current config to preserve systemPrompt
    req = urllib.request.Request(f"{API}/{agent_id}")
    with urllib.request.urlopen(req) as resp:
        current = json.loads(resp.read())

    system_prompt = current["adapterConfig"].get("systemPrompt", "")

    # Build new config
    patch = {
        "adapterType": "ollama_local",
        "adapterConfig": {
            "model": MODEL,
            "baseUrl": BASE_URL,
            "timeoutSec": info["timeout"],
            "enableTools": True,
            "systemPrompt": system_prompt,
        },
    }

    data = json.dumps(patch).encode()
    req = urllib.request.Request(
        f"{API}/{agent_id}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    print(f"  {info['name']:15s} -> {result['adapterType']} / {result['adapterConfig']['model']}")

print("\nDone! All 8 agents switched to ollama_local with", MODEL)
