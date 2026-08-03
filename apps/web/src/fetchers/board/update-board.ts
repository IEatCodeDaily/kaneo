import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateBoardRequest = InferRequestType<
  (typeof client)["board"][":id"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["board"][":id"]["$put"]>["param"];

async function updateBoard({
  id,
  name,
  icon,
  slug,
  description,
  isPublic,
  subtaskDepthLimit,
}: UpdateBoardRequest) {
  const response = await client.board[":id"].$put({
    param: { id },
    json: { name, icon, slug, description, isPublic, subtaskDepthLimit },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateBoard;
