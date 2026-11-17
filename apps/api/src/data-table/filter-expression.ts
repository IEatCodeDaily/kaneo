/** JSON contract shared by row queries and saved views. Root group is depth 1. */
export const MAX_FILTER_DEPTH = 3;
export const MAX_FILTER_CONDITIONS = 50;
export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "isEmpty"
  | "isNotEmpty"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "pastDays"
  | "nextDays"
  | "in"
  | "notIn"
  | "hasAny"
  | "hasAll"
  | "hasNone"
  | "isMe"
  | "isChecked"
  | "isNotChecked";
export type FilterCondition = {
  id?: string;
  fieldId: string;
  op: FilterOperator;
  value?: string | number | boolean | string[];
};
export type FilterGroup = {
  id?: string;
  conjunction: "and" | "or";
  children: (FilterCondition | FilterGroup)[];
};
const text: FilterOperator[] = [
  "eq",
  "neq",
  "contains",
  "notContains",
  "isEmpty",
  "isNotEmpty",
];
const number: FilterOperator[] = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "isEmpty",
  "isNotEmpty",
];
const date: FilterOperator[] = [
  "eq",
  "lt",
  "gt",
  "lte",
  "gte",
  "pastDays",
  "nextDays",
  "isEmpty",
  "isNotEmpty",
];
export function filterOperators(type: string): readonly FilterOperator[] {
  switch (type) {
    case "number":
    case "percent":
    case "currency":
      return number;
    case "date":
    case "datetime":
      return date;
    case "select":
      return ["eq", "neq", "in", "notIn", "isEmpty"];
    case "multiselect":
    case "ticket":
      return ["hasAny", "hasAll", "hasNone", "isEmpty"];
    case "user":
      return ["eq", "neq", "in", "isMe", "isEmpty"];
    case "checkbox":
      return ["isChecked", "isNotChecked"];
    case "link":
      return ["hasAny", "isEmpty"];
    default:
      return text;
  }
}
export const valuelessOperator = (op: FilterOperator) =>
  ["isEmpty", "isNotEmpty", "isMe", "isChecked", "isNotChecked"].includes(op);
export const listOperator = (op: FilterOperator) =>
  ["in", "notIn", "hasAny", "hasAll", "hasNone"].includes(op);

/** Validate before recursive parsing/SQL; bounds include empty groups and draft nodes. */
export function isFilterGroup(input: unknown): input is FilterGroup {
  let conditions = 0;
  let nodes = 0;
  const visit = (raw: unknown, depth: number): boolean => {
    if (++nodes > 100 || !raw || typeof raw !== "object" || Array.isArray(raw))
      return false;
    const node = raw as Record<string, unknown>;
    if (
      node.id !== undefined &&
      (typeof node.id !== "string" || node.id.length > 100)
    )
      return false;
    if ("conjunction" in node) {
      if (
        Object.keys(node).some(
          (key) => !["id", "conjunction", "children"].includes(key),
        )
      )
        return false;
      return (
        depth <= MAX_FILTER_DEPTH &&
        (node.conjunction === "and" || node.conjunction === "or") &&
        Array.isArray(node.children) &&
        node.children.length <= MAX_FILTER_CONDITIONS &&
        node.children.every((child) =>
          visit(
            child,
            depth +
              (typeof child === "object" &&
              child !== null &&
              "conjunction" in child
                ? 1
                : 0),
          ),
        )
      );
    }
    if (
      Object.keys(node).some(
        (key) => !["id", "fieldId", "op", "value"].includes(key),
      )
    )
      return false;
    if (
      ++conditions > MAX_FILTER_CONDITIONS ||
      typeof node.fieldId !== "string" ||
      !node.fieldId.length ||
      node.fieldId.length > 100 ||
      typeof node.op !== "string"
    )
      return false;
    const operators = [
      ...text,
      ...number,
      ...date,
      ...filterOperators("select"),
      ...filterOperators("multiselect"),
      ...filterOperators("user"),
      ...filterOperators("checkbox"),
    ];
    if (!operators.includes(node.op as FilterOperator)) return false;
    const value = node.value;
    return (
      value === undefined ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.length <= 1000) ||
      (Array.isArray(value) &&
        value.length <= 50 &&
        value.every(
          (v) => typeof v === "string" && v.length > 0 && v.length <= 1000,
        ))
    );
  };
  return (
    !!input &&
    typeof input === "object" &&
    "conjunction" in input &&
    visit(input, 1)
  );
}
