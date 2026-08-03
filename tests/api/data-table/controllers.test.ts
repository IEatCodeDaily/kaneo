import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, insert } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: { select, insert },
}));

import {
  attachCellsToRows,
  createDataTable,
  listDataTables,
} from "../../../apps/api/src/data-table/controllers";

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockResolvedValue(rows);
  return chain;
}

function insertChain(row: unknown) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

describe("data table controllers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists tables through an organization-scoped query", async () => {
    const rows = [{ id: "table-1", organizationId: "org-1", name: "CRM" }];
    const chain = selectChain(rows);
    select.mockReturnValue(chain);

    await expect(listDataTables("org-1")).resolves.toEqual(rows);
    expect(chain.where).toHaveBeenCalledOnce();
    expect(chain.orderBy).toHaveBeenCalledOnce();
  });

  it("persists the organization id when creating a table", async () => {
    const row = { id: "table-1", organizationId: "org-1", name: "CRM" };
    const chain = insertChain(row);
    insert.mockReturnValue(chain);

    await expect(
      createDataTable("org-1", { name: "CRM", icon: "database" }),
    ).resolves.toEqual(row);
    expect(chain.values).toHaveBeenCalledWith({
      organizationId: "org-1",
      name: "CRM",
      icon: "database",
    });
  });

  it("serializes cells inside their rows for the editable grid", () => {
    const rows = [{ id: "row-1" }, { id: "row-2" }];
    const cells = [
      { rowId: "row-1", fieldId: "field-1", value: "Acme" },
      { rowId: "row-1", fieldId: "field-2", value: "Qualified" },
    ];

    expect(attachCellsToRows(rows, cells)).toEqual([
      { id: "row-1", cells },
      { id: "row-2", cells: [] },
    ]);
  });
});
