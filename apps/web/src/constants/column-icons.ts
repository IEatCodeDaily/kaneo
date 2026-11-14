import {
  Archive,
  Ban,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Copy,
  Inbox,
  Search,
} from "lucide-react";
import boardIcons from "./board-icons";

export const DEFAULT_COLUMN_ICON_NAMES = {
  "to-do": "Circle",
  "in-progress": "CircleDot",
  "in-review": "Search",
  done: "CheckCircle2",
  archived: "Archive",
  planned: "CircleDashed",
  triage: "Inbox",
  canceled: "Ban",
  duplicate: "Copy",
} as const;

const columnIcons = {
  ...boardIcons,
  Circle,
  CircleDot,
  Search,
  CheckCircle2,
  CircleDashed,
  Archive,
  Inbox,
  Ban,
  Copy,
};

export type ColumnIconName = keyof typeof columnIcons;

export default columnIcons;
