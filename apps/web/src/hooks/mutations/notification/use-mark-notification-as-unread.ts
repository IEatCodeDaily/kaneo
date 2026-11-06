import { client } from "@kaneo/libs";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function useMarkNotificationAsUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await client.notification[":id"].unread.$patch({
        param: { id },
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["unread-notification-count"],
      });
    },
  });
}
