import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import useDeleteOrganizationMember from "@/hooks/mutations/organization-member/use-delete-organization-member";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

function DeleteTeamMemberModal({
  userId,
  open,
  onClose,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id ?? "";
  const { mutateAsync: deleteOrganizationMember } =
    useDeleteOrganizationMember();
  const queryClient = useQueryClient();
  const { canRemoveMembers } = useOrganizationPermission();
  const canRemove = canRemoveMembers();

  const onRemoveMember = async () => {
    if (!canRemove) return;
    await deleteOrganizationMember({
      organizationId,
      userId,
    });

    queryClient.invalidateQueries({
      queryKey: ["organization-members"],
    });

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogPopup size="sm">
        <DialogHeader>
          <DialogTitle>Remove Team Member</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to remove{" "}
          <span className="font-medium text-foreground">{userId}</span> from the
          team? This action cannot be undone.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancel
          </DialogClose>
          <Button
            onClick={onRemoveMember}
            variant="destructive"
            disabled={!canRemove}
          >
            <Trash2 /> Remove Member
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export default DeleteTeamMemberModal;
