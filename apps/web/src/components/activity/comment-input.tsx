import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import CommentComposer from "@/components/activity/comment-composer";
import useCreateComment from "@/hooks/mutations/comment/use-create-comment";
import { commentDraftKey } from "@/lib/editor-comment-draft";

type CommentInputProps = {
  taskId: string;
};

/** Ticket comments: the shared composer bound to the ticket comment API. */
export default function CommentInput({ taskId }: CommentInputProps) {
  const { mutateAsync: createComment } = useCreateComment();
  const queryClient = useQueryClient();

  const submit = useCallback(
    async (comment: string) => {
      await createComment({ taskId, comment });
      await queryClient.invalidateQueries({ queryKey: ["activities", taskId] });
    },
    [createComment, queryClient, taskId],
  );

  return (
    <CommentComposer
      draftKey={commentDraftKey(taskId)}
      onSubmit={submit}
      taskId={taskId}
    />
  );
}
