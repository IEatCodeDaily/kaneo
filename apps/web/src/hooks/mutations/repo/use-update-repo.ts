import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateRepo from "@/fetchers/repo/update-repo";

function useUpdateRepo({
  organizationId,
  teamId,
}: {
  organizationId: string;
  teamId?: string | null;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateRepo,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["repos", organizationId, teamId ?? "all"],
      }),
  });
}

export default useUpdateRepo;
