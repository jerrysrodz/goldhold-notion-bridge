// GoldHold Notion Bridge
// Syncs agent messages, tasks, and memories between GoldHold relay and Notion databases.
// Notion becomes a thin client -- a human-readable window into multi-agent orchestration.

import { Client } from "@notionhq/client";

const RELAY_URL = process.env.GOLDHOLD_RELAY_URL || "https://relay.goldhold.ai";

// Database IDs (set via env or defaults to Jerry's workspace)
const DB_MESSAGES = process.env.NOTION_DB_MESSAGES || "31fbaa84-054c-818c-a40e-f6826e305771";
const DB_TASKS = process.env.NOTION_DB_TASKS || "31fbaa84-054c-81e8-93b1-d9cd00a19947";
const DB_MEMORY = process.env.NOTION_DB_MEMORY || "31fbaa84-054c-819a-b7e9-cd424ba7fc4f";

let notion;

function initNotion() {
  if (!notion) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is required");
    notion = new Client({ auth: token });
  }
  return notion;
}

// --- Relay helpers ---

async function relayFetch(path, body, apiKey) {
  const key = apiKey || process.env.GOLDHOLD_API_KEY;
  if (!key) throw new Error("GOLDHOLD_API_KEY is required");
  const resp = await fetch(`${RELAY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "User-Agent": "GoldHold-Notion-Bridge/1.0"
    },
    body: JSON.stringify(body)
  });
  return resp.json();
}

// --- Sync: Messages -> Notion ---

export async function syncMessages(apiKey, options = {}) {
  const n = initNotion();
  const limit = options.limit || 20;

  // Fetch recent messages from GoldHold
  const data = await relayFetch("/v1/inbox", { limit }, apiKey);
  if (!data.ok) return { error: data.error || "Failed to fetch messages" };

  const messages = data.messages || [];
  let synced = 0;

  for (const msg of messages) {
    // Check if already in Notion (by GoldHold message ID in Subject)
    const existing = await n.databases.query({
      database_id: DB_MESSAGES,
      filter: { property: "Subject", title: { equals: msg.id || msg.subject || "unknown" } }
    });
    if (existing.results.length > 0) continue;

    await n.pages.create({
      parent: { database_id: DB_MESSAGES },
      properties: {
        "Subject": { title: [{ text: { content: msg.subject || msg.id || "Message" } }] },
        "From": { rich_text: [{ text: { content: msg.from || msg.h_created_by || "unknown" } }] },
        "To": { rich_text: [{ text: { content: msg.to || "self" } }] },
        "Message": { rich_text: [{ text: { content: (msg.text || msg.body || "").slice(0, 2000) } }] },
        "Timestamp": msg.h_created_at ? { date: { start: msg.h_created_at } } : undefined,
        "Status": { select: { name: "delivered" } }
      }
    });
    synced++;
  }

  return { ok: true, total: messages.length, synced };
}

// --- Sync: Tasks -> Notion ---

export async function syncTasks(apiKey, options = {}) {
  const n = initNotion();

  // Fetch tasks from GoldHold
  const data = await relayFetch("/v1/search", { query: "task", folder: "work", limit: 50 }, apiKey);
  // Also try the tasks endpoint
  let tasks = [];
  try {
    const resp = await fetch(`${RELAY_URL}/v1/tasks`, {
      headers: {
        "Authorization": `Bearer ${apiKey || process.env.GOLDHOLD_API_KEY}`,
        "User-Agent": "GoldHold-Notion-Bridge/1.0"
      }
    });
    const tdata = await resp.json();
    if (tdata.tasks) tasks = tdata.tasks;
  } catch (e) { /* tasks endpoint may not exist */ }

  let synced = 0;
  for (const task of tasks) {
    const taskId = task.id || task.task_id || "";
    const existing = await n.databases.query({
      database_id: DB_TASKS,
      filter: { property: "GoldHold ID", rich_text: { equals: taskId } }
    });

    const props = {
      "Task": { title: [{ text: { content: task.description || task.title || "Untitled" } }] },
      "Assignee": { rich_text: [{ text: { content: task.assignee || "unassigned" } }] },
      "Priority": { select: { name: task.priority || "normal" } },
      "Status": { select: { name: task.status === "completed" ? "done" : task.status === "in-progress" ? "in-progress" : "open" } },
      "GoldHold ID": { rich_text: [{ text: { content: taskId } }] }
    };
    if (task.created_at) props["Created"] = { date: { start: task.created_at } };

    if (existing.results.length > 0) {
      await n.pages.update({ page_id: existing.results[0].id, properties: props });
    } else {
      await n.pages.create({ parent: { database_id: DB_TASKS }, properties: props });
    }
    synced++;
  }

  return { ok: true, total: tasks.length, synced };
}

// --- Sync: Memories -> Notion ---

export async function syncMemories(apiKey, options = {}) {
  const n = initNotion();
  const query = options.query || "decision";
  const limit = options.limit || 20;

  const data = await relayFetch("/v1/search", { query, limit }, apiKey);
  if (!data.ok) return { error: data.error || "Failed to search memories" };

  const results = data.results || data.messages || [];
  let synced = 0;

  for (const mem of results) {
    const memId = mem.id || mem.c_self_hash || `mem_${synced}`;
    const existing = await n.databases.query({
      database_id: DB_MEMORY,
      filter: { property: "Memory", title: { equals: (mem.subject || memId).slice(0, 100) } }
    });
    if (existing.results.length > 0) continue;

    const props = {
      "Memory": { title: [{ text: { content: (mem.subject || mem.h_subject || memId).slice(0, 100) } }] },
      "Agent": { rich_text: [{ text: { content: mem.h_created_by || mem.from || "unknown" } }] },
      "Type": { select: { name: mem.h_type || mem.type || "NOTE" } },
      "Folder": { rich_text: [{ text: { content: mem.folder || mem.namespace || "" } }] },
      "Content": { rich_text: [{ text: { content: (mem.text || mem.body || mem.content || "").slice(0, 2000) } }] }
    };
    if (mem.h_created_at) props["Timestamp"] = { date: { start: mem.h_created_at } };

    await n.pages.create({ parent: { database_id: DB_MEMORY }, properties: props });
    synced++;
  }

  return { ok: true, total: results.length, synced };
}

// --- Send message FROM Notion (bidirectional) ---

export async function sendMessage(apiKey, { to, subject, body }) {
  const result = await relayFetch("/v1/send", { to, subject, body }, apiKey);

  if (result.ok) {
    const n = initNotion();
    await n.pages.create({
      parent: { database_id: DB_MESSAGES },
      properties: {
        "Subject": { title: [{ text: { content: subject || "Sent message" } }] },
        "From": { rich_text: [{ text: { content: "user" } }] },
        "To": { rich_text: [{ text: { content: to } }] },
        "Message": { rich_text: [{ text: { content: (body || "").slice(0, 2000) } }] },
        "Timestamp": { date: { start: new Date().toISOString() } },
        "Status": { select: { name: "sent" } }
      }
    });
  }

  return result;
}

// --- Create task FROM Notion ---

export async function createTask(apiKey, { description, assignee, priority }) {
  // Send as a task creation message
  const result = await relayFetch("/v1/send", {
    to: assignee || "self",
    subject: `Task: ${description}`,
    text: description,
    type: "task"
  }, apiKey);

  const n = initNotion();
  await n.pages.create({
    parent: { database_id: DB_TASKS },
    properties: {
      "Task": { title: [{ text: { content: description } }] },
      "Assignee": { rich_text: [{ text: { content: assignee || "unassigned" } }] },
      "Priority": { select: { name: priority || "normal" } },
      "Status": { select: { name: "open" } },
      "Created": { date: { start: new Date().toISOString() } },
      "GoldHold ID": { rich_text: [{ text: { content: result.id || "" } }] }
    }
  });

  return { ok: true, notion: "synced", relay: result };
}

// --- Agent comments on Notion pages (Super Comms) ---

export async function agentComment(apiKey, { pageId, agentName, message }) {
  const n = initNotion();

  // Post comment to Notion page
  await n.comments.create({
    parent: { page_id: pageId },
    rich_text: [{ type: "text", text: { content: `[${agentName}] ${message}` } }]
  });

  // Also send through GoldHold relay for persistence
  await relayFetch("/v1/send", {
    to: "self",
    subject: `Comment on ${pageId}`,
    body: `[${agentName}] ${message}`
  }, apiKey);

  return { ok: true, page_id: pageId, agent: agentName };
}

// --- Agent activity feed on any Notion page ---

export async function activityFeed(apiKey, { pageId, limit }) {
  const n = initNotion();
  const comments = await n.comments.list({ block_id: pageId, page_size: limit || 50 });
  return {
    ok: true,
    count: comments.results.length,
    feed: comments.results.map(c => ({
      id: c.id,
      created: c.created_time,
      text: c.rich_text.map(r => r.plain_text).join("")
    }))
  };
}

// --- Full sync (all three) ---

export async function syncAll(apiKey, options = {}) {
  const msgs = await syncMessages(apiKey, options);
  const tasks = await syncTasks(apiKey, options);
  const mems = await syncMemories(apiKey, options);
  return { ok: true, messages: msgs, tasks: tasks, memories: mems };
}

// --- CLI mode ---

if (process.argv[1] && process.argv[1].includes("index.js")) {
  const cmd = process.argv[2] || "sync-all";
  const apiKey = process.env.GOLDHOLD_API_KEY;

  console.log(`GoldHold Notion Bridge -- ${cmd}`);

  try {
    let result;
    switch (cmd) {
      case "sync-messages": result = await syncMessages(apiKey); break;
      case "sync-tasks": result = await syncTasks(apiKey); break;
      case "sync-memories": result = await syncMemories(apiKey); break;
      case "sync-all": result = await syncAll(apiKey); break;
      case "send": result = await sendMessage(apiKey, {
        to: process.argv[3], subject: process.argv[4], body: process.argv[5]
      }); break;
      default: console.log("Commands: sync-all, sync-messages, sync-tasks, sync-memories, send <to> <subject> <body>");
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}
