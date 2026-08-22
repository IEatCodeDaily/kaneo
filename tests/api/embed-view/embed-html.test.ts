import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * KFL-177: the embeddable web view. The API half is shipped
 * (GET /public-ticket-embed/:id -> {ticketKey,title,organizationName}, 404 for
 * private boards). What's missing is the public HTML a third-party site can
 * drop in an <iframe>:
 *
 *   /embed/ticket/<id>
 *
 * It must be a SEPARATE static entry — not part of the main SPA bundle — so an
 * embed on someone else's page doesn't drag the whole app with it (KFL-86).
 */

const webRoot = resolve(__dirname, "../../..");

describe("public ticket embed view", () => {
  it("serves a standalone embed.html that fetches the public endpoint", () => {
    const html = readFileSync(
      resolve(webRoot, "apps/web/public/embed.html"),
      "utf8",
    );

    // No framework, no bundle import: self-contained.
    expect(html).toContain("/api/public-ticket-embed/");
    expect(html).not.toMatch(/src="\/assets\//);
  });

  it("escapes all interpolated values to keep the embed XSS-proof", () => {
    const js = readFileSync(
      resolve(webRoot, "apps/web/public/embed.js"),
      "utf8",
    );

    // The escape helper must exist and innerHTML must never be assigned.
    expect(js).toMatch(/escapeHtml|textContent/);
    expect(js).not.toMatch(/innerHTML\s*=/);
  });
});
