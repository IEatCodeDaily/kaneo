import { useQuery } from "@tanstack/react-query";
import getMyFlags from "@/fetchers/flag/get-my-flags";

function useGetMyFlags() {
  return useQuery({
    queryKey: ["my-flags"],
    queryFn: () => getMyFlags(),
  });
}

export default useGetMyFlags;
