import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();
const mockHasOrganizationPermission = vi.fn();
const mockRequireResourcePrivilege = vi.fn();
const mockFetch = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  schema: {
    boardTable: { id: "board.id", organizationId: "board.organization_id" },
    taskTable: { id: "task.id", boardId: "task.board_id" },
    dataTableTable: {
      id: "data_table.id",
      organizationId: "data_table.organization_id",
    },
  },
}));

vi.mock("../../../apps/api/src/utils/require-organization-permission", () => ({
  hasOrganizationPermission: (...args: unknown[]) =>
    mockHasOrganizationPermission(...args),
}));

vi.mock("../../../apps/api/src/resource-access", () => ({
  requireResourcePrivilege: (...args: unknown[]) =>
    mockRequireResourcePrivilege(...args),
}));

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assertTablePermission,
  McpPermissionError,
} from "../../../apps/api/src/mcp/permissions";
import { registerMcpTools } from "../../../apps/api/src/mcp/tools";

const NEW_TOOLS = [
  "list_tables",
  "get_table",
  "list_table_rows",
  "create_table_row",
  "update_table_row",
  "delete_table_row",
  "create_table",
  "list_dashboards",
  "get_dashboard",
  "create_dashboard",
  "update_dashboard",
  "delete_dashboard",
  "generate_dashboard",
] as const;

/** Awaited select chain for the table → organization lookup in permissions. */
function selectReturning(rows: unknown[]) {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return builder;
}

async function connectClient() {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerMcpTools(server, "http://localhost:1337", "token", "user-1");
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    await InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasOrganizationPermission.mockResolvedValue(true);
  mockRequireResourcePrivilege.mockResolvedValue(true);
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 }),
  );
  // The ApiClient uses global fetch; stubbing it keeps tool calls off the
  // network (a stray dev server on :1337 would otherwise answer them).
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("table and dashboard MCP tool registration", () => {
  it("registers every new tool with a schema", async () => {
    const { client } = await connectClient();
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of NEW_TOOLS) {
      expect(byName.get(name), `${name} must be registered`).toBeDefined();
      expect(byName.get(name)?.inputSchema).toBeDefined();
    }
  });

  it("types generate_dashboard as table + description over the AI route", async () => {
    const { client } = await connectClient();
    const { tools } = await client.listTools();
    const genSchema = tools.find((tool) => tool.name === "generate_dashboard")
      ?.inputSchema as { properties: Record<string, unknown> } | undefined;
    expect(genSchema?.properties.tableId).toBeDefined();
    expect(genSchema?.properties.description).toBeDefined();
    expect(genSchema?.properties.name).toBeDefined();
  });

  it("types dashboard panels against the REST panel schema", async () => {
    const { client } = await connectClient();
    const { tools } = await client.listTools();
    const panels = (
      tools.find((tool) => tool.name === "update_dashboard")?.inputSchema as
        | {
            properties: {
              panels?: {
                items: {
                  properties: Record<string, { enum?: string[] }>;
                };
              };
            };
          }
        | undefined
    )?.properties.panels;

    expect(panels?.items.properties.type.enum).toEqual([
      "stat",
      "bar",
      "line",
      "area",
      "pie",
      "table",
    ]);
    expect(panels?.items.properties.span).toBeDefined();
    expect(panels?.items.properties.query).toBeDefined();
  });
});

describe("assertTablePermission", () => {
  it("rejects a table that does not exist or belongs to another organization", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-2" }]));
    await expect(
      assertTablePermission("user-1", "org-1", "table-1", "view"),
    ).rejects.toBeInstanceOf(McpPermissionError);
    expect(mockRequireResourcePrivilege).not.toHaveBeenCalled();
  });

  it("rejects a caller whose privilege ranks below the requirement", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-1" }]));
    mockRequireResourcePrivilege.mockResolvedValue(false);
    await expect(
      assertTablePermission("user-1", "org-1", "table-1", "edit"),
    ).rejects.toThrow(/Forbidden/);
    expect(mockRequireResourcePrivilege).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        resourceType: "table",
        resourceId: "table-1",
        userId: "user-1",
        required: "edit",
      }),
    );
  });

  it("allows a caller with sufficient table privilege", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-1" }]));
    await expect(
      assertTablePermission("user-1", "org-1", "table-1", "manage"),
    ).resolves.toBeUndefined();
  });
});

describe("generate_dashboard tool composition", () => {
  it("generates via the AI route, then creates and fills a dashboard", async () => {
    mockSelect.mockReturnValue(selectReturning([{ organizationId: "org-1" }]));

    const panels = [
      {
        id: "p1",
        title: "Row count",
        type: "stat",
        span: 6,
        query: { tableId: "table-1", metric: { agg: "count" } },
      },
    ];
    const responses: unknown[] = [
      { name: "AI name", panels },
      { id: "dash-1", name: "AI name" },
      { id: "dash-1", name: "AI name", panels },
    ];
    mockFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify(responses.shift()), { status: 200 }),
    );

    const { client } = await connectClient();
    const result = await client.callTool({
      name: "generate_dashboard",
      arguments: {
        organizationId: "org-1",
        tableId: "table-1",
        description: "rows per status",
      },
    });

    expect(result.isError).toBeFalsy();
    const calls = mockFetch.mock.calls;
    expect(calls).toHaveLength(3);
    const [, method, body] = [
      calls[0][0],
      calls[0][1]?.method,
      JSON.parse(calls[0][1]?.body as string),
    ];
    expect(String(calls[0][0])).toContain(
      "/api/ai/organization/org-1/generate-dashboard",
    );
    expect(method).toBe("POST");
    expect(body).toEqual({
      tableId: "table-1",
      description: "rows per status",
    });
    expect(String(calls[1][0])).toContain(
      "/api/data-table/organization/org-1/dashboards",
    );
    expect(calls[1][1]?.method).toBe("POST");
    expect(JSON.parse(calls[1][1]?.body as string)).toEqual({
      name: "AI name",
    });
    expect(String(calls[2][0])).toContain(
      "/api/data-table/organization/org-1/dashboards/dash-1",
    );
    expect(calls[2][1]?.method).toBe("PUT");
    expect(JSON.parse(calls[2][1]?.body as string)).toEqual({ panels });

    const content = JSON.parse(
      (result.content as Array<{ text: string }>)[0].text,
    );
    expect(content).toEqual({ id: "dash-1", name: "AI name", panels });
  });

  it("rejects invalid panel configs before any dashboard is created", async () => {
    const { client } = await connectClient();
    // Depending on the SDK version, schema-invalid arguments either reject
    // the call client-side or come back as an isError result; both prove
    // the payload never reached the REST surface.
    let outcome: unknown;
    try {
      outcome = await client.callTool({
        name: "update_dashboard",
        arguments: {
          organizationId: "org-1",
          dashboardId: "dash-1",
          panels: [
            {
              title: "bad",
              type: "hologram",
              span: 7,
              query: { tableId: "t", metric: { agg: "count" } },
            },
          ],
        },
      });
    } catch (error) {
      outcome = error;
    }
    const rejected =
      (outcome as { isError?: boolean }).isError === true ||
      outcome instanceof Error;
    expect(rejected).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
