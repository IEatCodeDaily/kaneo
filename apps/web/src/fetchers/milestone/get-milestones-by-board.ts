import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetMilestonesByBoardRequest = InferRequestType<
  (typeof client)["milestone"]["board"][":boardId"]["$get"]
>["param"];

async function getMilestonesByBoard({ boardId }: GetMilestonesByBoardRequest) {
  const response = await client.milestone.board[":boardId"].$get({
    param: {
      boardId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default getMilestonesByBoard;
