import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const PersonalHome = lazy(() => import("@/components/home/personal-home"));

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/home",
)({
  component: () => (
    <Suspense fallback={null}>
      <PersonalHome />
    </Suspense>
  ),
});
