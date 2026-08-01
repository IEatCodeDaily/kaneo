import { client } from "@kaneo/libs";
import type { TaskFlag } from "./get-task-flags";

async function getMyFlags() {
  const response = await client.flag.mine.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as TaskFlag[];
}

export default getMyFlags;
