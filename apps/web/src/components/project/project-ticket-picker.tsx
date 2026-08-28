import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectTicket } from "@/fetchers/project/get-project-tickets";
import useAddProjectTicket from "@/hooks/mutations/project/use-add-project-ticket";
import useRemoveProjectTicket from "@/hooks/mutations/project/use-remove-project-ticket";

type ProjectTicketPickerProps = {
  projectId: string;
  tickets: ProjectTicket[];
};

/**
 * Explicit add/remove membership control on the Tickets tab. Mutations report
 * API rejection through `mutationFn`'s throw — no optimistic ticket list or
 * aggregate changes are fabricated; success invalidates through the mutation
 * hooks.
 */
export function ProjectTicketPicker({
  projectId,
  tickets,
}: ProjectTicketPickerProps) {
  const { t } = useTranslation();
  const [taskId, setTaskId] = useState("");
  const add = useAddProjectTicket();
  const remove = useRemoveProjectTicket();

  return (
    <div className="space-y-3 p-3" data-testid="project-ticket-picker">
      <div className="flex gap-2">
        <Input
          aria-label={t("projects:tickets.add")}
          onChange={(event) => setTaskId(event.target.value)}
          placeholder={t("projects:validation.ticketRequired")}
          value={taskId}
        />
        <Button
          onClick={() => {
            if (taskId.trim()) {
              add.mutate({ id: projectId, taskId: taskId.trim() });
              setTaskId("");
            }
          }}
          variant="outline"
        >
          {t("projects:tickets.add")}
        </Button>
      </div>
      <ul className="space-y-1">
        {tickets.map((ticket) => (
          <li className="flex items-center gap-2" key={ticket.id}>
            <span className="min-w-0 flex-1 truncate text-sm">
              {ticket.key}
            </span>
            <Button
              onClick={() =>
                remove.mutate({ id: projectId, taskId: ticket.id })
              }
              size="xs"
              variant="ghost"
            >
              {t("projects:tickets.remove")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ProjectTicketPicker;
