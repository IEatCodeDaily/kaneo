import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetBoardRequest = InferRequestType<
  (typeof client)["board"][":id"]["$get"]
>["param"] & { organizationId: string };

async function getBoard({ id }: GetBoardRequest) {
  const response = await client.board[":id"].$get({
    param: { id },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getBoard;
