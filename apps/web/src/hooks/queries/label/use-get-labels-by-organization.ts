import { useQuery } from "@tanstack/react-query";
import getLabelsByOrganization from "@/fetchers/label/get-label-by-organization";

function useGetLabelsByOrganization(organizationId: string) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["labels", organizationId],
    queryFn: () => getLabelsByOrganization({ organizationId }),
  });
}

export default useGetLabelsByOrganization;
