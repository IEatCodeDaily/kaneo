import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetBoardsRequest = InferRequestType<
  (typeof client)["board"]["$get"]
>["query"];

async function getBoards({ organizationId }: GetBoardsRequest) {
  if (!organizationId) return;

  const response = await client.board.$get({ query: { organizationId } });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getBoards;
