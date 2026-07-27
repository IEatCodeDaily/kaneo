# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 05-search.spec.ts >> global search >> command palette surfaces repo results and navigates
- Location: tests/e2e/specs/05-search.spec.ts:31:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').getByText('Repositories')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('dialog').getByText('Repositories')

```

```yaml
- region "Notifications"
- dialog:
  - combobox "Search for apps and commands...": kaneo-test
  - status: No results found.
  - listbox
  - text: Navigate Open Esc Close
```

# Test source

```ts
  1  | import { expect, gotoAndSettle, loadFixtures, test } from "../helpers";
  2  | 
  3  | const fixtures = loadFixtures();
  4  | 
  5  | test.describe("global search", () => {
  6  |   const searchUrl = () =>
  7  |     `/dashboard/organization/${fixtures.organizationId}/search`;
  8  | 
  9  |   test("finds repositories, issues, and pull requests", async ({
  10 |     page,
  11 |     pageErrors,
  12 |   }) => {
  13 |     test.skip(!fixtures.repoName, "no repo fixture available");
  14 |     await gotoAndSettle(page, searchUrl());
  15 | 
  16 |     const input = page.getByRole("textbox").first();
  17 |     await input.fill(fixtures.repoName as string);
  18 | 
  19 |     // The API is queried live; results arrive asynchronously.
  20 |     await expect
  21 |       .poll(async () => (await page.locator("body").innerText()).length, {
  22 |         timeout: 20_000,
  23 |       })
  24 |       .toBeGreaterThan(0);
  25 | 
  26 |     const body = await page.locator("body").innerText();
  27 |     expect(body).toContain(fixtures.repoName as string);
  28 |     expect(pageErrors).toEqual([]);
  29 |   });
  30 | 
  31 |   test("command palette surfaces repo results and navigates", async ({
  32 |     page,
  33 |     pageErrors,
  34 |   }) => {
  35 |     test.skip(!fixtures.repoName, "no repo fixture available");
  36 |     await gotoAndSettle(page, "/dashboard");
  37 | 
  38 |     // Open the command palette via its registered shortcut.
  39 |     await page.keyboard.press("ControlOrMeta+k");
  40 |     const dialog = page.getByRole("dialog");
  41 |     await expect(dialog).toBeVisible();
  42 | 
  43 |     await page.keyboard.type(fixtures.repoName as string);
  44 | 
  45 |     // Repositories group must appear for a repo-name query.
> 46 |     await expect(dialog.getByText("Repositories")).toBeVisible({
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  47 |       timeout: 20_000,
  48 |     });
  49 | 
  50 |     const repoOption = dialog
  51 |       .getByRole("option", { name: new RegExp(fixtures.repoName as string, "i") })
  52 |       .first();
  53 |     await expect(repoOption).toBeVisible();
  54 |     await repoOption.click();
  55 | 
  56 |     // Selecting a repository result navigates into the repo code view.
  57 |     await expect(page).toHaveURL(new RegExp(`/repo/${fixtures.repoId}`), {
  58 |       timeout: 20_000,
  59 |     });
  60 |     expect(pageErrors).toEqual([]);
  61 |   });
  62 | 
  63 |   test("search API returns repo, issue, and pull request result types", async ({
  64 |     page,
  65 |   }) => {
  66 |     test.skip(!fixtures.repoName, "no repo fixture available");
  67 |     // Assert on the contract directly so a UI-only regression can't hide it.
  68 |     const response = await page.request.get(
  69 |       `${fixtures.baseURL}/api/search?q=${encodeURIComponent("Fixture")}&type=all&organizationId=${fixtures.organizationId}&limit=50`,
  70 |     );
  71 |     expect(response.ok()).toBeTruthy();
  72 |     const body = await response.json();
  73 |     const types = new Set(
  74 |       (body.results ?? []).map((result: { type: string }) => result.type),
  75 |     );
  76 |     // At least the GitHub-derived types must be searchable now.
  77 |     expect(types.has("issue") || types.has("pull_request")).toBeTruthy();
  78 |   });
  79 | });
  80 | 
```