import type React from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileUserFab } from "@/components/common/mobile-user-fab";
import { useSidebarWidth } from "@/components/common/sidebar-resize-handle";
import { DemoAlert } from "@/components/demo-alert";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isDemoMode } from "@/constants/urls";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

type LayoutProps = {
  children: ReactNode;
  className?: string;
};

type HeaderProps = {
  children: ReactNode;
  className?: string;
};

type ContentProps = {
  children: ReactNode;
  className?: string;
};

function LayoutHeader({ children, className }: HeaderProps) {
  return (
    <header
      className={cn(
        // design v3 §1.4: 44px, never shrinks with the sidebar state.
        "flex h-11 shrink-0 items-center gap-2 border-b border-border px-3",
        className,
      )}
    >
      <SidebarTrigger
        className="shrink-0 md:hidden"
        data-testid="mobile-sidebar-toggle"
      />
      {children}
    </header>
  );
}

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

// design v3 §1.4: one 40px row under the header; owns height, gutter and gap.
function LayoutToolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 border-b border-border px-3",
        className,
      )}
      data-slot="layout-toolbar"
    >
      {children}
    </div>
  );
}

function LayoutContent({ children, className }: ContentProps) {
  return (
    <div className={cn("flex-1 min-h-0", className)}>
      <div className="md:h-full">{children}</div>
    </div>
  );
}

function Layout({ children, className }: LayoutProps) {
  const { sidebarDefaultOpen, setSidebarDefaultOpen } =
    useUserPreferencesStore();
  /*
    Resizable sidebar: the persisted width (re-clamped for this viewport)
    overrides the CSS default. Everything downstream — gap element, fixed
    container, inset margin — derives from --sidebar-width, so one variable
    resizes the whole layout consistently.
  */
  const sidebarWidth = useSidebarWidth();

  // #125: preference effects moved to the router root so they also apply on
  // routes that do not render <Layout> (Settings in particular).

  return (
    <div className="flex w-full bg-background">
      <SidebarProvider
        defaultOpen={sidebarDefaultOpen}
        onOpenChange={setSidebarDefaultOpen}
        open={sidebarDefaultOpen}
        style={
          {
            "--sidebar-width": sidebarWidth ?? "calc(var(--spacing) * 60)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background md:m-2 md:h-[calc(100svh-1rem)] md:overflow-auto md:rounded-lg md:border md:border-border",
            className,
          )}
        >
          {isDemoMode && <DemoAlert />}
          {children}
          <MobileUserFab />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

Layout.Header = LayoutHeader;
Layout.Toolbar = LayoutToolbar;
Layout.Content = LayoutContent;

export default Layout;
