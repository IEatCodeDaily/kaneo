import { client } from "@kaneo/libs";
import type { StatusType } from "@/constants/task-statuses";

async function createColumn(
  boardId: string,
  data: {
    name: string;
    icon?: string;
    color?: string;
    statusType?: StatusType;
    showOnBoard?: boolean;
  },
) {
  const response = await client.column[":boardId"].$post({
    param: { boardId },
    json: data,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default createColumn;
