import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

test.describe("repo issue and pull request details", () => {
  test.skip(!fixtures.repoId, "no repo fixture available");

  const issueUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`;
  const pullUrl = () =>
    `/dashboard/organization/${fixtures.organizationId}/repo/${fixtures.repoId}/pulls/${fixtures.pullNumber}`;

  test("issue detail renders every panel without runtime errors", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());

    // Description panel, metadata sidebar, and task links must all mount. The
    // "RepoTaskLinks is not defined" regression died exactly here.
    await expect(
      page.getByRole("heading", { name: "Description" }),
    ).toBeVisible();
    await expect(page.getByLabel("Issue metadata")).toBeVisible();
    await expect(page.getByText("Linked Tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Synced Tasks", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Synced Task" }),
    ).toBeVisible();
    const detailResponse = await page.request.get(
      `/api/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}`,
    );
    expect(detailResponse.ok()).toBeTruthy();
    const detailPayload = await detailResponse.json();
    const relationCount =
      (detailPayload.github?.parent ? 1 : 0) +
      (detailPayload.github?.subIssues?.length ?? 0);
    const relations = page.getByTestId("repo-issue-relations");
    await expect(
      relations.getByRole("heading", { name: "Relations" }),
    ).toBeVisible();
    await expect(relations.getByText(`${relationCount} linked`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Link(?: task)?$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rename issue" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close issue" }),
    ).toBeVisible();

    const desktopLayout = await page.evaluate(() => {
      const detail = document.querySelector<HTMLElement>(
        '[data-testid="repo-item-detail"]',
      );
      const detailPane = detail?.parentElement;
      const resizeInput = document.querySelector<HTMLElement>(
        'input[aria-label="Resize list panel"]',
      );
      return {
        detailHeight: detail?.getBoundingClientRect().height ?? 0,
        detailPaneOverflowY: detailPane
          ? getComputedStyle(detailPane).overflowY
          : "missing",
        resizeInputVisible: resizeInput
          ? resizeInput.getBoundingClientRect().width > 1 ||
            resizeInput.getBoundingClientRect().height > 1
          : false,
        viewportHeight: innerHeight,
      };
    });
    expect(desktopLayout.detailHeight).toBeGreaterThanOrEqual(
      desktopLayout.viewportHeight - 80,
    );
    expect(desktopLayout.detailPaneOverflowY).toBe("auto");
    expect(desktopLayout.resizeInputVisible).toBe(false);

    const listViewport = page.getByTestId("repo-list-viewport");
    const detailViewport = page.getByTestId("repo-detail-viewport");
    await detailViewport.evaluate((element) => {
      element.scrollTop = Math.min(
        120,
        element.scrollHeight - element.clientHeight,
      );
    });
    const listAfterDetailScroll = await listViewport.evaluate(
      (element) => element.scrollTop,
    );
    expect(listAfterDetailScroll).toBe(0);

    const detailAfterDetailScroll = await detailViewport.evaluate(
      (element) => element.scrollTop,
    );
    await listViewport.evaluate((element) => {
      element.scrollTop = Math.min(
        80,
        element.scrollHeight - element.clientHeight,
      );
    });
    expect(await detailViewport.evaluate((element) => element.scrollTop)).toBe(
      detailAfterDetailScroll,
    );
    expect(pageErrors).toEqual([]);
  });

  test("mobile detail uses document scrolling and a compact, shell-free layout", async ({
    page,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await page.setViewportSize({ width: 390, height: 700 });
    await gotoAndSettle(page, issueUrl());

    const detail = page.getByTestId("repo-item-detail");
    const article = detail.locator(":scope > article");
    const composer = page.getByTestId("repo-comment-composer");
    await expect(detail).toBeVisible();
    await expect(article).toHaveCSS("border-top-width", "0px");
    await expect(detail).toHaveCSS("padding-left", "0px");
    await expect(composer).toBeVisible();

    const metrics = await page.evaluate(() => {
      const inset = document.querySelector<HTMLElement>(
        '[data-slot="sidebar-inset"]',
      );
      const composerElement = document.querySelector<HTMLElement>(
        '[data-testid="repo-comment-composer"]',
      );
      return {
        bodyScrollable: document.documentElement.scrollHeight > innerHeight,
        composerHeight: composerElement?.getBoundingClientRect().height ?? 0,
        insetOverflowY: inset ? getComputedStyle(inset).overflowY : "missing",
      };
    });
    expect(metrics.bodyScrollable).toBe(true);
    expect(metrics.insetOverflowY).toBe("visible");
    expect(metrics.composerHeight).toBeLessThan(170);

    const detailTopBefore = await detail.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y: 600 }],
    });
    for (const y of [540, 480, 420, 360, 300, 240]) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 195, y }],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        detail.evaluate((element) => element.getBoundingClientRect().top),
      )
      .toBeLessThan(detailTopBefore);
  });

  test("pull request detail renders every panel without runtime errors", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.pullNumber, "no mirrored pull request available");
    await gotoAndSettle(page, pullUrl());

    await expect(
      page.getByRole("heading", { name: "Description" }),
    ).toBeVisible();
    await expect(page.getByLabel("Pull Request metadata")).toBeVisible();
    await expect(page.getByText("Linked Tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Synced Tasks", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Add Synced Task" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("repo-issue-relations")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("description editor opens inline with rich editing affordances", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());

    await page.getByRole("button", { name: /^Edit$/ }).click();

    // Scope to the editable surface: the comment timeline renders its own
    // read-only ProseMirror nodes, so `.ProseMirror` alone is ambiguous.
    const editor = page.locator(".ProseMirror[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancel/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save/ })).toBeVisible();
    // No dialog should have opened for description editing.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Cancel restores the read-only view without persisting anything.
    await page.getByRole("button", { name: /Cancel/ }).click();
    await expect(editor).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("slash menu opens and is keyboard navigable", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());
    await page.getByRole("button", { name: /^Edit$/ }).click();

    const editor = page.locator(".ProseMirror[contenteditable='true']").first();
    await expect(editor).toBeVisible();
    await editor.click();
    // Start on a fresh line so the slash trigger regex matches.
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");

    const menu = page.locator(".kaneo-tiptap-slash-menu");
    await expect(menu).toBeVisible();
    const items = menu.locator(".kaneo-tiptap-slash-item");
    await expect(items.first()).toBeVisible();

    // Arrow keys move the selection; the selected item must change.
    const firstSelected = await menu
      .locator(".kaneo-tiptap-slash-item.is-selected")
      .innerText();
    await page.keyboard.press("ArrowDown");
    const secondSelected = await menu
      .locator(".kaneo-tiptap-slash-item.is-selected")
      .innerText();
    expect(secondSelected).not.toEqual(firstSelected);

    // Escape dismisses without inserting a block.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.getByRole("button", { name: /Cancel/ }).click();
    expect(pageErrors).toEqual([]);
  });

  test("slash command inserts a block via Enter", async ({ page }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());
    await page.getByRole("button", { name: /^Edit$/ }).click();

    const editor = page.locator(".ProseMirror[contenteditable='true']").first();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/todo");

    const menu = page.locator(".kaneo-tiptap-slash-menu");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();

    // A task list node should now exist in the document.
    await expect(editor.locator("ul[data-type='taskList']")).toHaveCount(1);

    // Leave the issue untouched on GitHub.
    await page.getByRole("button", { name: /Cancel/ }).click();
  });

  test("offline mirrored issues keep metadata readable and hide unsupported GitHub mutations", async ({
    page,
    pageErrors,
  }) => {
    test.skip(!fixtures.issueNumber, "no mirrored issue available");
    await gotoAndSettle(page, issueUrl());

    const sidebar = page.getByLabel("Issue metadata");
    await expect(sidebar.getByText("Labels", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Assignees", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Milestone", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add sub-issue" }),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
