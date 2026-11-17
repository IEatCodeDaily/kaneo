import type { TableRowQuery } from "@/types/data-table";
import { readWidths } from "./column-resize";
import {
  type Density,
  readDensity,
  readFrozenColumns,
  readHiddenFields,
  readShowSystemFields,
} from "./data-table-format";

export type SavedViewConfig = {
  // Opaque to persistence; the filter editor/query owns its evolving shape.
  filters: unknown;
  sort: TableRowQuery["sort"];
  groupFieldId: string | null;
  hiddenFields: string[];
  fieldOrder: string[];
  columnWidths: Record<string, number>;
  rowHeight: Density;
  frozenColumns: number;
  summaries: NonNullable<TableRowQuery["summaries"]>;
  showSystemFields: boolean;
};
export type SavedTableView = {
  id: string;
  name: string;
  isDefault: boolean;
  config: SavedViewConfig | null;
};
export function legacyViewConfig(tableId: string): SavedViewConfig {
  return {
    filters: [],
    sort: null,
    groupFieldId: null,
    hiddenFields: readHiddenFields(tableId),
    fieldOrder: [],
    columnWidths: readWidths(tableId),
    rowHeight: readDensity(tableId),
    frozenColumns: readFrozenColumns(tableId),
    summaries: {},
    showSystemFields: readShowSystemFields(tableId),
  };
}
