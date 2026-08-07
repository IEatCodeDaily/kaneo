import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentContextMenu } from "./attachment-context-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const writeText = vi.fn(() => Promise.resolve());
const openSpy = vi.fn();

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  writeText.mockClear();
  openSpy.mockClear();
});

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText },
});
Object.defineProperty(window, "open", {
  configurable: true,
  value: openSpy,
});

function renderMenu(props?: {
  isImage?: boolean;
  filename?: string;
  onRemove?: () => void;
}) {
  render(
    <AttachmentContextMenu
      url="/api/asset/asset-1"
      filename={props?.filename ?? "diagram.png"}
      isImage={props?.isImage ?? true}
      onRemove={props?.onRemove}
    >
      <button type="button" data-testid="attachment-target">
        diagram.png
      </button>
    </AttachmentContextMenu>,
  );
}

function openContextMenu() {
  fireEvent.contextMenu(screen.getByTestId("attachment-target"));
}

function selectItem(testId: string) {
  fireEvent.click(screen.getByTestId(testId), { button: 0 });
}

describe("AttachmentContextMenu", () => {
  it("does not show the menu until the attachment is right-clicked", () => {
    renderMenu();

    expect(
      screen.queryByTestId("attachment-context-menu"),
    ).not.toBeInTheDocument();

    openContextMenu();

    expect(screen.getByTestId("attachment-context-menu")).toBeInTheDocument();
  });

  it("offers copy address, open in new tab, download and copy markdown", () => {
    renderMenu();
    openContextMenu();

    expect(screen.getByTestId("attachment-copy-address")).toHaveTextContent(
      "tasks:attachment.copyImageAddress",
    );
    expect(screen.getByTestId("attachment-open-new-tab")).toHaveTextContent(
      "tasks:attachment.openInNewTab",
    );
    expect(screen.getByTestId("attachment-download")).toHaveTextContent(
      "tasks:attachment.download",
    );
    expect(screen.getByTestId("attachment-copy-markdown")).toHaveTextContent(
      "tasks:attachment.copyMarkdown",
    );
  });

  it("only offers remove for removable attachments and invokes it", () => {
    const onRemove = vi.fn();
    renderMenu({ onRemove });
    openContextMenu();
    selectItem("attachment-remove");
    expect(onRemove).toHaveBeenCalledOnce();

    cleanup();
    renderMenu();
    openContextMenu();
    expect(screen.queryByTestId("attachment-remove")).not.toBeInTheDocument();
  });

  it("copies the absolute attachment address", () => {
    renderMenu();
    openContextMenu();

    selectItem("attachment-copy-address");

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/api/asset/asset-1`,
    );
  });

  it("copies image markdown for images and link markdown for files", () => {
    renderMenu({ isImage: true });
    openContextMenu();
    selectItem("attachment-copy-markdown");

    expect(writeText).toHaveBeenCalledWith(
      `![diagram.png](${window.location.origin}/api/asset/asset-1)`,
    );

    cleanup();
    document.body.innerHTML = "";
    writeText.mockClear();

    renderMenu({ isImage: false, filename: "spec.pdf" });
    openContextMenu();
    selectItem("attachment-copy-markdown");

    expect(writeText).toHaveBeenCalledWith(
      `[spec.pdf](${window.location.origin}/api/asset/asset-1)`,
    );
  });

  it("opens the attachment in a new tab", () => {
    renderMenu();
    openContextMenu();

    selectItem("attachment-open-new-tab");

    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}/api/asset/asset-1`,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("triggers a download with the attachment filename", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");
    clickSpy.mockImplementation(() => {});

    renderMenu({ filename: "spec.pdf", isImage: false });
    openContextMenu();

    selectItem("attachment-download");

    expect(clickSpy).toHaveBeenCalled();
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.getAttribute("download")).toBe("spec.pdf");

    clickSpy.mockRestore();
  });
});
