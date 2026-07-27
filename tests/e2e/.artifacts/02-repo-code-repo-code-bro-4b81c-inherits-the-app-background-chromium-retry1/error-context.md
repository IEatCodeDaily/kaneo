# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-repo-code.spec.ts >> repo code browser >> code surface inherits the app background
- Location: tests/e2e/specs/02-repo-code.spec.ts:100:3

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /rgba\(0,\s*0,\s*0,\s*0\)|transparent/
Received string:  ""
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e5]:
    - generic [ref=e8]:
      - generic [ref=e10]:
        - list [ref=e11]:
          - listitem [ref=e12]:
            - button "NevrLabs" [ref=e13] [cursor=pointer]
        - generic [ref=e18]:
          - button "Notifications" [ref=e19] [cursor=pointer]
          - button "PE" [ref=e22] [cursor=pointer]
      - generic [ref=e26]:
        - button "Search /" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: Search
          - generic [ref=e34]: /
        - generic [ref=e36]:
          - button "Overview" [expanded] [ref=e37] [cursor=pointer]
          - list [ref=e43]:
            - listitem [ref=e44]:
              - button "Boards" [ref=e45] [cursor=pointer]
            - listitem [ref=e47]:
              - button "Members" [ref=e48] [cursor=pointer]
            - listitem [ref=e50]:
              - button "Invitations" [ref=e51] [cursor=pointer]
        - generic [ref=e54]:
          - button "Boards" [expanded] [ref=e55] [cursor=pointer]
          - list [ref=e61]:
            - listitem [ref=e62]:
              - button "Test" [ref=e63] [cursor=pointer]
              - button "More" [ref=e65]
            - listitem [ref=e71]:
              - button "Stellarc" [ref=e72] [cursor=pointer]
              - button "More" [ref=e74]
            - listitem [ref=e80]:
              - button "Kaneo Test" [ref=e81] [cursor=pointer]
              - button "More" [ref=e83]
            - listitem [ref=e89]:
              - button "Add board" [ref=e90] [cursor=pointer]
        - generic [ref=e93]:
          - button "Repos" [expanded] [ref=e94] [cursor=pointer]
          - list [ref=e100]:
            - listitem [ref=e101]:
              - button "kaneo-test 10 1" [ref=e102] [cursor=pointer]:
                - generic [ref=e103]: kaneo-test
                - generic [ref=e104]:
                  - generic [ref=e105]: "10"
                  - generic [ref=e109]: "1"
            - listitem [ref=e114]:
              - button "All repos" [ref=e115] [cursor=pointer]
      - generic [ref=e118]:
        - link "v3.0.0-dev" [ref=e120] [cursor=pointer]:
          - /url: https://github.com/usekaneo/kaneo/blob/main/CHANGELOG.md
        - generic [ref=e121]:
          - generic [ref=e122]:
            - switch "Toggle theme" [ref=e123]
            - checkbox [ref=e124]
          - generic [ref=e125]: Toggle theme
    - main [ref=e126]:
      - generic [ref=e129]:
        - button "Toggle sidebar" [ref=e130] [cursor=pointer]
        - generic [ref=e133]: IEatCodeDaily/kaneo-test
        - navigation "Repository views" [ref=e135]:
          - link [ref=e136] [cursor=pointer]:
            - /url: /dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/repo/qkwllrmt4h95iarsjydx6o5g/code
          - link [ref=e141] [cursor=pointer]:
            - /url: /dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/repo/qkwllrmt4h95iarsjydx6o5g/issues
          - link [ref=e145] [cursor=pointer]:
            - /url: /dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/repo/qkwllrmt4h95iarsjydx6o5g/pulls
          - link [ref=e150] [cursor=pointer]:
            - /url: /dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/repo/qkwllrmt4h95iarsjydx6o5g/releases
          - link [ref=e156] [cursor=pointer]:
            - /url: /dashboard/organization/Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5/repo/qkwllrmt4h95iarsjydx6o5g/packages
      - generic [ref=e163]:
        - generic [ref=e164]:
          - generic [ref=e165]: README.md
          - generic [ref=e166]: default branch
        - generic [ref=e171]:
          - complementary "File explorer" [ref=e172]:
            - list [ref=e173]:
              - listitem [ref=e174]:
                - button "docs" [ref=e175]
              - listitem [ref=e181]:
                - button "examples" [ref=e182]
              - listitem [ref=e188]:
                - button "src" [ref=e189]
              - listitem [ref=e195]:
                - button "lifecycle-test.txt" [ref=e196]
              - listitem [ref=e201]:
                - button "pr-linked.txt" [ref=e202]
              - listitem [ref=e207]:
                - button "README.md" [active] [ref=e208]
          - generic [ref=e213]:
            - generic [ref=e214]:
              - generic [ref=e215]: README.md
              - generic [ref=e221]:
                - generic [ref=e222]: 77 B
                - generic [ref=e223]:
                  - button "Source" [ref=e224] [cursor=pointer]
                  - button "Preview" [ref=e225] [cursor=pointer]
            - code [ref=e228]:
              - generic [ref=e229]: "# kaneo-test"
              - generic [ref=e230]: Isolated Kaneo GitHub integration test fixture; safe to delete.
  - generic:
    - region "Notifications"
```

# Test source

```ts
  14  |   }) => {
  15  |     await gotoAndSettle(page, codeUrl());
  16  | 
  17  |     const explorer = page.getByLabel("File explorer");
  18  |     await expect(explorer).toBeVisible();
  19  | 
  20  |     // Root entries must render from the mirrored repo contents.
  21  |     const entries = explorer.locator("button");
  22  |     await expect(entries.first()).toBeVisible();
  23  |     const rootCount = await entries.count();
  24  |     expect(rootCount).toBeGreaterThan(0);
  25  | 
  26  |     // Expanding a folder should add children without unmounting the tree.
  27  |     const folder = explorer.getByRole("button", { name: /^src$|^docs$/ }).first();
  28  |     if (await folder.count()) {
  29  |       await folder.click();
  30  |       await expect
  31  |         .poll(async () => explorer.locator("button").count(), { timeout: 15_000 })
  32  |         .toBeGreaterThan(rootCount);
  33  |       await expect(explorer).toBeVisible();
  34  |     }
  35  | 
  36  |     expect(pageErrors).toEqual([]);
  37  |   });
  38  | 
  39  |   test("opens a file with syntax highlighting and keeps the tree mounted", async ({
  40  |     page,
  41  |     pageErrors,
  42  |   }) => {
  43  |     await gotoAndSettle(page, codeUrl());
  44  |     const explorer = page.getByLabel("File explorer");
  45  | 
  46  |     // Drill into src/ then pick a source file.
  47  |     const srcFolder = explorer.getByRole("button", { name: "src" }).first();
  48  |     test.skip(!(await srcFolder.count()), "fixture repo has no src directory");
  49  |     await srcFolder.click();
  50  | 
  51  |     const componentsFolder = explorer
  52  |       .getByRole("button", { name: "components" })
  53  |       .first();
  54  |     if (await componentsFolder.count()) await componentsFolder.click();
  55  | 
  56  |     const file = explorer
  57  |       .getByRole("button", { name: /\.(tsx|ts|json|md)$/ })
  58  |       .first();
  59  |     await expect(file).toBeVisible();
  60  |     const fileName = (await file.innerText()).trim();
  61  |     await file.click();
  62  | 
  63  |     // Detail pane shows the file, and Shiki produced highlighted markup.
  64  |     await expect(page.getByText(fileName, { exact: false }).first()).toBeVisible();
  65  |     await expect(page.locator("pre").first()).toBeVisible({ timeout: 20_000 });
  66  | 
  67  |     // The explorer stays mounted: selecting a file must not remount the tree.
  68  |     await expect(explorer).toBeVisible();
  69  |     await expect(explorer.getByRole("button", { name: "src" })).toBeVisible();
  70  | 
  71  |     expect(pageErrors).toEqual([]);
  72  |   });
  73  | 
  74  |   test("markdown files offer a source/preview toggle", async ({
  75  |     page,
  76  |     pageErrors,
  77  |   }) => {
  78  |     await gotoAndSettle(page, codeUrl());
  79  |     const explorer = page.getByLabel("File explorer");
  80  | 
  81  |     const readme = explorer.getByRole("button", { name: /README\.md/i }).first();
  82  |     test.skip(!(await readme.count()), "fixture repo has no root README.md");
  83  |     await readme.click();
  84  | 
  85  |     const sourceButton = page.getByRole("button", { name: "Source" });
  86  |     const previewButton = page.getByRole("button", { name: "Preview" });
  87  |     await expect(sourceButton).toBeVisible({ timeout: 20_000 });
  88  |     await expect(previewButton).toBeVisible();
  89  | 
  90  |     // Source shows raw markdown in a <pre>; preview renders HTML instead.
  91  |     await expect(page.locator("pre").first()).toBeVisible();
  92  |     await previewButton.click();
  93  |     await expect(page.locator(".prose").first()).toBeVisible();
  94  |     await sourceButton.click();
  95  |     await expect(page.locator("pre").first()).toBeVisible();
  96  | 
  97  |     expect(pageErrors).toEqual([]);
  98  |   });
  99  | 
  100 |   test("code surface inherits the app background", async ({ page }) => {
  101 |     await gotoAndSettle(page, codeUrl());
  102 |     const explorer = page.getByLabel("File explorer");
  103 |     const file = explorer.getByRole("button", { name: /\.(md|json|ts|tsx)$/ }).first();
  104 |     test.skip(!(await file.count()), "no text file in fixture root");
  105 |     await file.click();
  106 | 
  107 |     const pre = page.locator("pre").first();
  108 |     await expect(pre).toBeVisible({ timeout: 20_000 });
  109 |     // Shiki's inlined theme background is stripped; the element must be
  110 |     // transparent so it blends with the card surface.
  111 |     const background = await pre.evaluate(
  112 |       (node) => getComputedStyle(node).backgroundColor,
  113 |     );
> 114 |     expect(background).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/);
      |                        ^ Error: expect(received).toMatch(expected)
  115 |   });
  116 | });
  117 | 
```