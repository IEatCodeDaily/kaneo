import type { DataTableField } from "@/types/data-table";
import type { MemberOption } from "./data-table-cells";
import {
  DataTableCellContent,
  JsonCellEditor,
  TableCellInput,
} from "./data-table-editors";

/** The same persistent, typed controls for row forms and field defaults. */
export function FieldValueEditor({
  field,
  value,
  members,
  onChange,
  onInvalidChange,
}: {
  field: DataTableField;
  value: unknown;
  members: Map<string, MemberOption>;
  onChange: (value: unknown) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const props = {
    field,
    value,
    formMode: true,
    onCommit: onChange,
    onCancel: () => {},
    onInvalidChange,
  };
  if (field.type === "json") return <JsonCellEditor {...props} />;
  if (
    !["select", "multiselect", "checkbox", "user", "ticket", "link"].includes(
      field.type,
    )
  )
    return <TableCellInput {...props} />;
  return (
    <div className="flex min-h-8 min-w-0 items-center rounded-md border px-2 text-ui">
      <DataTableCellContent
        row={{
          id: "",
          position: 0,
          createdAt: "",
          updatedAt: "",
          values: { [field.id]: value },
        }}
        field={field}
        members={members}
        canEdit
        expanded
        isEditing={false}
        onEditStart={() => {}}
        onEditEnd={() => {}}
        onCommit={onChange}
      />
    </div>
  );
}
