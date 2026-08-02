import { Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  /*
    #164 optimistic-local-wins: while the user is editing, their own text is
    authoritative. Incoming server titles (background refetch, websocket, a
    rename elsewhere) must not be written into the field under the cursor.
  */
  const [isEditing, setIsEditing] = useState(false);

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
    defaultValues: {
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

  // #164: subscribe to the saver so the spinner appears while a write is in
  // flight. The saver is deliberately non-React, so this bridges it in.
  const isSaving = useSyncExternalStore(
    saver.subscribe,
    saver.saving,
    () => false,
  );

  /*
    #164 optimistic-local-wins.

    The field used to be bound with `values: { title: task?.title }`, which
    makes react-hook-form re-sync from the server on EVERY render — so a
    background refetch mid-typing replaced the text under the cursor. That is
    the "title changes while the user is editing" report.

    A server title is now adopted only when the user is not editing and there
    is nothing queued or in flight. Local edits always win.
  */
  useEffect(() => {
    if (task?.title === undefined) return;
    if (isEditing || saver.pending() || saver.saving()) return;
    if (form.getValues("title") === task.title) return;
    form.setValue("title", task.title);
  }, [task?.title, isEditing, saver, form]);

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
          <div className="flex w-full items-center gap-2">
            <input
              {...field}
              type="text"
              placeholder={t("tasks:detail.titlePlaceholder")}
              readOnly={!canEdit}
              // A single-line input clips long titles with no way to read the
              // rest, and the Properties sidebar cuts it off further. Expose the
              // full value as a tooltip rather than letting it silently vanish.
              title={field.value || undefined}
              className="block h-auto min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-heading text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-foreground/45"
              onChange={(e) => {
                field.onChange(e);
                handleTitleChange(e.target.value);
              }}
              onFocus={() => setIsEditing(true)}
              onBlur={() => {
                field.onBlur();
                // #164: editing ends here, so a server title may be adopted
                // again from this point on.
                setIsEditing(false);
                // Leaving the field means the user is done: save now instead of
                // waiting out the remaining debounce.
                flushTitle();
              }}
            />
            {/*
              #164: the save is debounced and silent, so a rename felt like it
              might not have registered. Show a spinner aligned to the right
              edge of the title row while the write is in flight.
            */}
            {isSaving && (
              <Loader2
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin text-muted-foreground"
                data-testid="task-title-saving"
              />
            )}
            <span aria-live="polite" className="sr-only">
              {isSaving ? t("tasks:detail.titleSaving") : ""}
            </span>
          </div>
        )}
      />
    </Form>
  );
}
