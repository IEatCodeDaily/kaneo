const{request}=require("@playwright/test");

(async()=>{
  const c = await request.newContext({baseURL:"https://kaneo.entelechia.cloud"});
  const token = JSON.parse(require("fs").readFileSync("/home/rpw/.hermes/mcp-tokens/kaneo.json","utf8")).access_token;
  const id = "gxs8ebu2trqvmj0ms2vrz56z";
  
  const desc = [
    "## Shipped (v2 - addresses review feedback)",
    "",
    "**Commit:** f23e3a8e",
    "",
    "### Nested milestone disclosure",
    "Board expand now shows **collapsible milestone sections** instead of a flat task list.",
    "Each section has its own chevron toggle:",
    "- Milestone name + task count",
    "- Scheduled without milestone section for unassigned tickets",
    "- Each section reveals/hides its scheduled ticket bars independently",
    "- Expand all / Collapse all cascades through boards AND sections",
    "",
    "### Stale ticket cleanup",
    "- Purged 1,507 soft-deleted tickets from the database",
    "- Wired purgeTrashedTasks into the hourly scheduler cron",
    "",
    "### Live verification",
    "- Board expand shows 3 collapsible milestone sections",
    "- Section expand reveals ticket bars",
    "- Expand all: 19 task bars + 5 sections across all boards",
    "- Collapse all: everything collapsed, zero errors",
    "- 23/23 component tests passed",
    "- Production build passed"
  ].join("\n");

  const body = {
    id,
    title: "Improve Boards Overview Timeline hierarchy and controls",
    description: desc,
    priority: "high",
    status: "in-review",
    position: 1,
    userId: "Ay4IlkAOIMc5Qz26AJGkvpjoYs8Ryomv",
    number: 327,
    boardId: "bz268m76v2r4eiqialpo1apo"
  };
  
  const r = await c.put(`/api/task/${id}`, {
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    data: body
  });
  console.log("ticket:", r.status(), r.statusText());
  
  const cr = await c.post(`/api/comment`, {
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    data: {taskId: id, comment: "v2 pushed: nested milestone section disclosure + stale ticket purge (1,507 purged, hourly cron wired). Addressed both review points."}
  });
  console.log("comment:", cr.status(), cr.statusText());
})();
