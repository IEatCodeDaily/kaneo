import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  CreateDashboardInput,
  DashboardDetail,
  DashboardQueryRow,
  DashboardSummary,
  DashboardTarget,
  QuerySpec,
  UpdateDashboardInput,
} from "@/types/dashboards";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Dashboard request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const base = (organizationId: string) =>
  `/data-table/organization/${encodeURIComponent(organizationId)}`;

const dashboardPath = ({ organizationId, dashboardId }: DashboardTarget) =>
  `${base(organizationId)}/dashboards/${encodeURIComponent(dashboardId)}`;

export const getDashboards = (organizationId: string) =>
  request<DashboardSummary[]>(`${base(organizationId)}/dashboards`);

export const getDashboard = (target: DashboardTarget) =>
  request<DashboardDetail>(dashboardPath(target));

export const createDashboard = ({
  organizationId,
  name,
}: CreateDashboardInput) =>
  request<DashboardSummary>(`${base(organizationId)}/dashboards`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateDashboard = ({
  organizationId,
  dashboardId,
  name,
  panels,
}: UpdateDashboardInput) =>
  request<DashboardDetail>(dashboardPath({ organizationId, dashboardId }), {
    method: "PUT",
    body: JSON.stringify({
      ...(name !== undefined && { name }),
      ...(panels !== undefined && { panels }),
    }),
  });

export const deleteDashboard = (target: DashboardTarget) =>
  request<{ success: true }>(dashboardPath(target), { method: "DELETE" });

export const runDashboardQuery = ({
  organizationId,
  query,
}: {
  organizationId: string;
  query: QuerySpec;
}) => {
  const { tableId, ...body } = query;
  return request<{ rows: DashboardQueryRow[] }>(
    `${base(organizationId)}/${encodeURIComponent(tableId)}/query`,
    { method: "POST", body: JSON.stringify(body) },
  );
};
