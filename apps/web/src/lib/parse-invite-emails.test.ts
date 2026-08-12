import { describe, expect, it } from "vitest";
import { parseInviteEmails } from "@/lib/parse-invite-emails";

/**
 * Bulk invite: the textarea has to survive the shapes people actually paste —
 * newline lists out of a spreadsheet, comma lists out of a mail client, and
 * "Name <addr>" pairs. A parser that only handled one of those would look
 * finished and reject most real input.
 */
describe("parseInviteEmails", () => {
  it("splits newline, comma, semicolon and whitespace separated lists", () => {
    const { emails, invalid } = parseInviteEmails(
      "a@x.com\nb@x.com, c@x.com; d@x.com e@x.com",
    );

    expect(emails).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
      "e@x.com",
    ]);
    expect(invalid).toEqual([]);
  });

  it("unwraps 'Display Name <addr>' pasted from a mail client", () => {
    const { emails, invalid } = parseInviteEmails("Alice Smith <alice@x.com>");

    expect(emails).toEqual(["alice@x.com"]);
    // The display name is not reported as a bad address.
    expect(invalid).toEqual([]);
  });

  it("collapses duplicates case-insensitively", () => {
    const { emails } = parseInviteEmails("Dup@x.com, dup@x.com\nDUP@X.COM");

    expect(emails).toEqual(["Dup@x.com"]);
  });

  it("reports non-addresses instead of silently dropping them", () => {
    const { emails, invalid } = parseInviteEmails("good@x.com, nope, bad@");

    expect(emails).toEqual(["good@x.com"]);
    expect(invalid).toEqual(["nope", "bad@"]);
  });

  it("returns nothing for blank and whitespace-only input", () => {
    expect(parseInviteEmails("")).toEqual({ emails: [], invalid: [] });
    expect(parseInviteEmails("  \n , ; \n ")).toEqual({
      emails: [],
      invalid: [],
    });
  });

  it("preserves entry order", () => {
    const { emails } = parseInviteEmails("z@x.com\na@x.com\nm@x.com");

    expect(emails).toEqual(["z@x.com", "a@x.com", "m@x.com"]);
  });

  it("still accepts a single address, the pre-bulk behaviour", () => {
    const { emails, invalid } = parseInviteEmails("solo@x.com");

    expect(emails).toEqual(["solo@x.com"]);
    expect(invalid).toEqual([]);
  });
});
