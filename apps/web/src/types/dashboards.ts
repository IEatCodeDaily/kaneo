export type DashboardAgg = "count" | "sum" | "avg" | "min" | "max";

export type DashboardPanelType =
  | "stat"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "table";

export type DashboardPanelSpan = 6 | 8 | 9 | 12 | 15 | 16 | 24;

export type DashboardDateBucket = "day" | "week" | "month";

export type DashboardFilterOp =
  | "eq"
  | "neq"
  | "in"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "isEmpty";

export type DashboardFilter = {
  fieldId: string;
  op: DashboardFilterOp;
  value?: unknown;
};

export type QuerySpec = {
  tableId: string;
  metric: { agg: DashboardAgg; fieldId?: string };
  groupBy?: { fieldId: string; bucket?: DashboardDateBucket };
  filters?: DashboardFilter[];
  limit?: number;
};

export type DashboardPanelSpec = {
  id: string;
  title: string;
  type: DashboardPanelType;
  span: DashboardPanelSpan;
  query: QuerySpec;
};

export type DashboardSummary = {
  id: string;
  organizationId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardDetail = DashboardSummary & {
  panels: DashboardPanelSpec[];
};

export type DashboardQueryRow = { label: unknown; value: number };

export type CreateDashboardInput = {
  organizationId: string;
  name: string;
};

export type UpdateDashboardInput = {
  organizationId: string;
  dashboardId: string;
  name?: string;
  panels?: DashboardPanelSpec[];
};

export type DashboardTarget = {
  organizationId: string;
  dashboardId: string;
};

// Structural view of a data-table field. The canonical shape lives in
// types/data-table.ts (owned by the tables track) — dashboards only need
// id/name/type/options, so we read through a local type instead of coupling
// to that file's evolution.
export type DashboardFieldChoice = {
  id: string;
  label: string;
  color?: string;
};

export type DashboardFieldView = {
  id: string;
  name: string;
  type: string;
  options?: unknown;
};

export const DASHBOARD_PANEL_SPANS: DashboardPanelSpan[] = [
  6, 8, 9, 12, 15, 16, 24,
];
