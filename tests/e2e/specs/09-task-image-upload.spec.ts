import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";

const fixtures = loadFixtures();

// A 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/**
 * Object storage uploads have broken twice in ways unit tests cannot catch:
 * a missing CORS rule on the bucket, and a path-style vs virtual-hosted
 * endpoint mismatch. Both only fail in a real browser, because only a browser
 * performs the cross-origin preflight against the storage provider.
 *
 * The first test therefore drives the upload from inside the page so the
 * browser enforces CORS, instead of using request-context calls that bypass it.
 */
test.describe("task image upload to object storage", () => {
  let taskId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: fixtures.baseURL,
      storageState: "tests/e2e/.auth/user.json",
    });

    const columnsResponse = await context.request.get(
      `${fixtures.baseURL}/api/column/${fixtures.boardId}`,
    );
    const columns = await columnsResponse.json();
    const columnSlug = Array.isArray(columns) ? columns[0]?.slug : null;

    const created = await context.request.post(
      `${fixtures.baseURL}/api/task/${fixtures.boardId}`,
      {
        data: {
          title: `E2E upload ${Date.now()}`,
          description: "Seeded by the Playwright upload suite.",
          status: columnSlug ?? "to-do",
          priority: "medium",
        },
      },
    );
    expect(created.ok()).toBeTruthy();
    const task = await created.json();
    taskId = task.id ?? task.data?.id ?? null;
    expect(taskId).toBeTruthy();
    await context.close();
  });

  test("uploads from the browser without a CORS failure and renders the asset", async ({
    page,
    pageErrors,
  }) => {
    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`,
    );

    const result = await page.evaluate(
      async ({ id, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), (char) =>
          char.charCodeAt(0),
        );

        const presignResponse = await fetch(`/api/task/image-upload/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: "pixel.png",
            contentType: "image/png",
            size: bytes.length,
            surface: "description",
          }),
        });
        if (!presignResponse.ok) {
          return {
            presignStatus: presignResponse.status,
            presignBody: (await presignResponse.text()).slice(0, 300),
            storageStatus: undefined as number | undefined,
            corsError: null as string | null,
            finalizeStatus: 0,
            assetUrl: null as string | null,
            assetRenders: false,
          };
        }
        const upload = await presignResponse.json();

        // The browser performs a CORS preflight here. A missing or wrong
        // AllowedOrigins rule surfaces as a thrown TypeError, not an HTTP code.
        let storageStatus: number | undefined;
        let corsError: string | null = null;
        try {
          const put = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: upload.headers ?? { "Content-Type": "image/png" },
            body: bytes,
          });
          storageStatus = put.status;
        } catch (error) {
          corsError = String(error);
        }

        const finalizeResponse = await fetch(
          `/api/task/image-upload/${id}/finalize`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: upload.key,
              filename: "pixel.png",
              contentType: "image/png",
              size: bytes.length,
              surface: "description",
            }),
          },
        );
        const asset = finalizeResponse.ok
          ? await finalizeResponse.json()
          : null;

        let assetRenders = false;
        if (asset?.url) {
          assetRenders = await new Promise<boolean>((resolve) => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = asset.url;
          });
        }

        return {
          presignStatus: presignResponse.status,
          presignBody: undefined as string | undefined,
          storageStatus,
          corsError,
          finalizeStatus: finalizeResponse.status,
          assetUrl: asset?.url ?? null,
          assetRenders,
        };
      },
      { id: taskId, base64: PNG_BASE64 },
    );

    expect(result.presignStatus, result.presignBody ?? "").toBe(200);
    // Explicit: a CORS rejection must fail loudly and name the likely cause.
    expect(
      result.corsError,
      "Browser upload was blocked by CORS — check the bucket's AllowedOrigins rule.",
    ).toBeNull();
    expect(result.storageStatus).toBe(200);
    expect(result.finalizeStatus).toBe(200);
    expect(result.assetUrl).toBeTruthy();
    expect(
      result.assetRenders,
      "Uploaded asset did not render back in the browser.",
    ).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test("renders auto-synced integration links in the same Resources section", async ({
    page,
    pageErrors,
    request,
  }) => {
    // Auto-synced links (board↔GitHub integration, webhooks) live in
    // `external_link`, while manually linked items live in
    // `task_repo_item_link`. They were once rendered by two separate
    // components, both headed "Resources"; collapsing them into one section
    // previously dropped the auto-synced list entirely, making integration
    // links invisible. This asserts the merged section shows both.
    const linksResponse = await request.get(
      `${fixtures.baseURL}/api/external-link/task/${taskId}`,
    );
    expect(linksResponse.ok()).toBeTruthy();
    const externalLinks = await linksResponse.json();

    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`,
    );

    const section = page.locator("section", { hasText: "Resources" }).first();

    // Exactly one "Resources" header — the merge must not reintroduce two.
    await expect(page.getByText("Resources", { exact: true })).toHaveCount(1);

    const hrefs = await section
      .locator("a")
      .evaluateAll((anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href")),
      );

    // Every auto-synced link must be present in the rendered section.
    for (const link of externalLinks as { url: string }[]) {
      expect(
        hrefs,
        `Auto-synced link ${link.url} is missing from the Resources section.`,
      ).toContain(link.url);
    }

    // The same resource must never be listed twice.
    expect(new Set(hrefs).size, "Duplicate rows rendered.").toBe(hrefs.length);
    expect(pageErrors).toEqual([]);
  });

  test("labels each resource with its repository and marks auto-linked rows", async ({
    page,
    pageErrors,
    request,
  }) => {
    test.skip(
      !fixtures.repoId || !fixtures.issueNumber,
      "no repo/issue fixture to link",
    );

    // The suite's task starts with no resources, so seed one manual link. This
    // asserts on rows that exist rather than on an empty section, which would
    // pass vacuously.
    const linked = await request.post(
      `${fixtures.baseURL}/api/repo/${fixtures.repoId}/issues/${fixtures.issueNumber}/task-links`,
      { data: { taskId } },
    );
    expect([200, 201, 409]).toContain(linked.status());

    await gotoAndSettle(
      page,
      `/dashboard/organization/${fixtures.organizationId}/board/${fixtures.boardId}/task/${taskId}`,
    );

    const section = page.locator("section", { hasText: "Resources" }).first();
    const rows = section.locator("> div > a, > div > div");
    await expect(rows.first()).toBeVisible();

    const measurements = await rows.evaluateAll((elements) =>
      elements.map((element) => {
        const repo = element.querySelector('span[title*="/"]');
        const autoBadge = element.querySelector(
          'span[title^="Linked automatically"]',
        );
        const row = element.getBoundingClientRect();
        const container = (
          element.parentElement as HTMLElement
        ).getBoundingClientRect();
        return {
          repoLabel: repo?.getAttribute("title") ?? null,
          isAutoLinked: Boolean(autoBadge),
          // A long repo name must clip, never widen the row.
          overflowsContainer: row.width > container.width + 1,
          scrollsHorizontally: element.scrollWidth > element.clientWidth + 1,
        };
      }),
    );

    expect(measurements.length).toBeGreaterThan(0);

    for (const row of measurements) {
      // Every row states which repository it belongs to.
      expect(row.repoLabel, "Resource row is missing its repo label.").toMatch(
        /^[^/]+\/[^/]+$/,
      );
      // Overflow is the actual regression risk: long names must be clipped.
      expect(
        row.overflowsContainer,
        `Row for ${row.repoLabel} overflows the Resources section.`,
      ).toBe(false);
      expect(
        row.scrollsHorizontally,
        `Row for ${row.repoLabel} scrolls horizontally instead of truncating.`,
      ).toBe(false);
    }

    // Manual links are unlinkable and must NOT claim to be auto-linked.
    const manualRows = measurements.filter((row) => !row.isAutoLinked);
    expect(
      manualRows.length,
      "Expected at least one manually linked resource row.",
    ).toBeGreaterThan(0);

    expect(pageErrors).toEqual([]);
  });

  test("stores the exact bytes that were uploaded", async ({ request }) => {
    const original = Buffer.from(PNG_BASE64, "base64");

    const presign = await request.put(
      `${fixtures.baseURL}/api/task/image-upload/${taskId}`,
      {
        data: {
          filename: "roundtrip.png",
          contentType: "image/png",
          size: original.length,
          surface: "description",
        },
      },
    );
    expect(presign.ok()).toBeTruthy();
    const upload = await presign.json();

    const put = await request.fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers ?? { "Content-Type": "image/png" },
      data: original,
    });
    expect(put.status()).toBe(200);

    const finalize = await request.post(
      `${fixtures.baseURL}/api/task/image-upload/${taskId}/finalize`,
      {
        data: {
          key: upload.key,
          filename: "roundtrip.png",
          contentType: "image/png",
          size: original.length,
          surface: "description",
        },
      },
    );
    expect(finalize.ok()).toBeTruthy();
    const asset = await finalize.json();

    const download = await request.get(
      asset.url.startsWith("http")
        ? asset.url
        : `${fixtures.baseURL}${asset.url}`,
    );
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toContain("image/png");
    expect(Buffer.from(await download.body()).equals(original)).toBe(true);
  });
});
