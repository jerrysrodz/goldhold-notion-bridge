// GoldHold Notion Bridge -- MCP Server
// Exposes GoldHold <-> Notion sync as MCP tools for any AI agent.
// "Notion is the thin client. GoldHold is the memory."

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { syncMessages, syncTasks, syncMemories, syncAll, sendMessage, createTask } from "./index.js";

const API_KEY = process.env.GOLDHOLD_API_KEY;

const TOOLS = [
  {
    name: "goldhold_notion_sync_all",
    description: "Sync all GoldHold data to Notion: messages, tasks, and memories. Notion becomes a live dashboard of multi-agent activity.",
    inputSchema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "goldhold_notion_sync_messages",
    description: "Sync agent-to-agent messages from GoldHold inbox to the Notion Agent Messages database.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max messages to sync (default 20)" } }
    }
  },
  {
    name: "goldhold_notion_sync_tasks",
    description: "Sync GoldHold tasks to the Notion Agent Tasks board. Bidirectional -- updates existing rows.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "goldhold_notion_sync_memories",
    description: "Sync GoldHold memories (decisions, notes, facts, directives) to the Notion Project Memory timeline.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for memories to sync (default: 'decision')" },
        limit: { type: "number", description: "Max memories to sync (default 20)" }
      }
    }
  },
  {
    name: "goldhold_notion_send_message",
    description: "Send a message through GoldHold relay AND record it in the Notion Agent Messages database. Agent-to-agent communication visible to humans.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Target agent ID" },
        subject: { type: "string", description: "Message subject" },
        body: { type: "string", description: "Message body" }
      },
      required: ["to", "body"]
    }
  },
  {
    name: "goldhold_notion_create_task",
    description: "Create a task in GoldHold AND the Notion Agent Tasks board. Assign to any agent.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Task description" },
        assignee: { type: "string", description: "Agent to assign the task to" },
        priority: { type: "string", enum: ["high", "normal", "low"], description: "Task priority" }
      },
      required: ["description"]
    }
  }
];

const server = new Server(
  { name: "goldhold-notion-bridge", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  try {
    switch (name) {
      case "goldhold_notion_sync_all":
        result = await syncAll(API_KEY);
        break;
      case "goldhold_notion_sync_messages":
        result = await syncMessages(API_KEY, args || {});
        break;
      case "goldhold_notion_sync_tasks":
        result = await syncTasks(API_KEY, args || {});
        break;
      case "goldhold_notion_sync_memories":
        result = await syncMemories(API_KEY, args || {});
        break;
      case "goldhold_notion_send_message":
        result = await sendMessage(API_KEY, args);
        break;
      case "goldhold_notion_create_task":
        result = await createTask(API_KEY, args);
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    result = { error: e.message };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
