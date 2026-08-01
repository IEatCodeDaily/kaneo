import { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Form, FormField } from "@/components/ui/form";
import { useUpdateTaskTitle } from "@/hooks/mutations/task/use-update-task-title";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { createTaskTitleSaver } from "@/lib/task-title-save";

type TaskTitleProps = {
  taskId: string;
};

export default function TaskTitle({ taskId }: TaskTitleProps) {
  const { t } = useTranslation();
  const { data: task } = useGetTask(taskId);
  const { mutateAsync: updateTaskTitle } = useUpdateTaskTitle();
  const { canManageTasks } = useOrganizationPermission();
  const canEdit = canManageTasks();
  const isInitializedRef = useRef(false);
  const taskRef = useRef(task);
  const updateTaskRef = useRef(updateTaskTitle);

  useEffect(() => {
    taskRef.current = task;
    updateTaskRef.current = updateTaskTitle;
  }, [task, updateTaskTitle]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: taskId is not needed here
  useEffect(() => {
    isInitializedRef.current = false;
  }, [taskId]);

  const form = useForm<{
    title: string;
  }>({
    values: {
      title: task?.title || "",
    },
  });

  useEffect(() => {
    if (task?.title !== undefined) isInitializedRef.current = true;
  }, [task?.title]);

  // One saver per task: it owns the debounce window and remembers which value
  // is already persisted, so a burst of keystrokes becomes a single write
  // instead of one request (and one activity entry) per character.
  const saver = useMemo(
    () =>
      createTaskTitleSaver({
        initialTitle: taskRef.current?.title ?? "",
        save: async (title: string) => {
          const currentTask = taskRef.current;
          const updateTaskFn = updateTaskRef.current;

          if (!currentTask || !updateTaskFn) return;
          // A late flush must never write this title onto the task the drawer
          // has since navigated to.
          if (currentTask.id !== taskId) return;

          await updateTaskFn({ ...currentTask, title });
        },
        onError: (error) => {
          console.error("Failed to update title:", error);
        },
      }),
    [taskId],
  );

  // Adopt server-side titles (initial load, rename from elsewhere) as the
  // baseline so they are not echoed back as a user edit.
  useEffect(() => {
    if (task?.title === undefined) return;
    if (saver.pending()) return;
    if (task.title === saver.saved()) return;
    saver.reset(task.title);
  }, [task?.title, saver]);

  const handleTitleChange = useCallback(
    (value: string) => {
      if (!isInitializedRef.current) return;
      saver.change(value);
    },
    [saver],
  );

  const flushTitle = useCallback(() => {
    void saver.flush();
  }, [saver]);

  useEffect(
    () => () => {
      // Unmount or navigation to another task can happen before the debounce
      // expires. Flush the last keystroke rather than discarding it.
      void saver.flush();
    },
    [saver],
  );

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <input
            {...field}
            type="text"
            placeholder={t("tasks:detail.titlePlaceholder")}
            readOnly={!canEdit}
            // A single-line input clips long titles with no way to read the
            // rest, and the Properties sidebar cuts it off further. Expose the
            // full value as a tooltip rather than letting it silently vanish.
            title={field.value || undefined}
            className="block h-auto w-full appearance-none border-0 bg-transparent p-0 font-heading text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-foreground/45"
            onChange={(e) => {
              field.onChange(e);
              handleTitleChange(e.target.value);
            }}
            onBlur={() => {
              field.onBlur();
              // Leaving the field means the user is done: save now instead of
              // waiting out the remaining debounce.
              flushTitle();
            }}
          />
        )}
      />
    </Form>
  );
}
