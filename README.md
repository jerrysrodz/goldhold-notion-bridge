# GoldHold Notion Bridge

**Notion as a thin client for multi-agent memory, messaging, and task orchestration.**

Your AI agents already talk to each other, share tasks, and build collective memory through [GoldHold](https://goldhold.ai). This bridge lets you watch it all happen in Notion.

## What It Does

| Notion Database | GoldHold Source | Direction |
|----------------|-----------------|-----------|
| Agent Messages | `/v1/inbox`, `/v1/send` | Bidirectional |
| Agent Tasks | Task queue | Bidirectional |
| Project Memory | `/v1/search` (decisions, notes, facts) | GoldHold -> Notion |

- **Agent-to-agent messages** appear as rows in Notion -- watch Chief talk to Sage in real time
- **Tasks** sync between GoldHold and Notion -- assign work to agents, track completion
- **Memories** (decisions, notes, directives) flow from GoldHold into a searchable Notion timeline
- **Kill the session. Come back. Nothing lost.** GoldHold remembers. Notion shows it.

## Quick Start

### As MCP Server (Claude Desktop, Cursor, etc.)

```json
{
  "mcpServers": {
    "goldhold-notion": {
      "command": "node",
      "args": ["mcp-server.js"],
      "cwd": "/path/to/goldhold-notion-bridge",
      "env": {
        "GOLDHOLD_API_KEY": "your_goldhold_api_key",
        "NOTION_TOKEN": "your_notion_internal_integration_token"
      }
    }
  }
}
```

### As CLI

```bash
export GOLDHOLD_API_KEY=your_key
export NOTION_TOKEN=your_notion_token

# Sync everything
node index.js sync-all

# Sync just memories
node index.js sync-memories

# Send a message (goes to GoldHold relay AND Notion)
node index.js send agent_name "Subject" "Message body"
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `goldhold_notion_sync_all` | Sync messages, tasks, and memories to Notion |
| `goldhold_notion_sync_messages` | Sync agent inbox to Notion |
| `goldhold_notion_sync_tasks` | Sync task board (bidirectional) |
| `goldhold_notion_sync_memories` | Sync decisions/notes/facts to Notion timeline |
| `goldhold_notion_send_message` | Send message via GoldHold + record in Notion |
| `goldhold_notion_create_task` | Create task in GoldHold + Notion |

## Architecture

```
Agent A ----\                          /---- Notion: Agent Messages
Agent B -----> GoldHold Relay <------> Bridge <---- Notion: Agent Tasks
Agent C ----/                          \---- Notion: Project Memory
                                              ^
                                        Jerry watches here
```

GoldHold is the backend. Notion is the frontend. The bridge translates.

## Setup

1. **GoldHold account** -- [goldhold.ai](https://goldhold.ai) ($9/mo)
2. **Notion internal integration** -- [notion.so/my-integrations](https://www.notion.so/my-integrations)
3. **Share a Notion page** with your integration (the bridge creates databases inside it)
4. **Set environment variables** and run

## Built With

- [GoldHold](https://goldhold.ai) -- Persistent memory for AI agents (U.S. Patent Pending #63/988,484)
- [Notion MCP](https://developers.notion.com/docs/mcp) -- Notion's Model Context Protocol integration
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) -- Official MCP TypeScript SDK

## License

Proprietary -- All Auto Tunes LLC
