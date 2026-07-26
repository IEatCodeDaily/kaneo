import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetLabelsByTaskRequest = InferRequestType<
  (typeof client)["label"]["organization"][":organizationId"]["$get"]
>["param"];

async function getLabelsByTask({ organizationId }: GetLabelsByTaskRequest) {
  const response = await client.label.organization[":organizationId"].$get({
    param: {
      organizationId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default getLabelsByTask;
