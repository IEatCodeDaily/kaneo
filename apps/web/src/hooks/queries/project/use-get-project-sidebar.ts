import { useQuery } from "@tanstack/react-query";
import getProjectSidebar from "@/fetchers/project/get-project-sidebar";

export default function useGetProjectSidebar(organizationId: string) {
  return useQuery({
    queryKey: ["project-sidebar", organizationId],
    queryFn: () => getProjectSidebar(organizationId),
    enabled: !!organizationId,
  });
}
