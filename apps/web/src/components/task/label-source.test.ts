import { describe, expect, it } from "vitest";
import {
  canSelectLabelSource,
  isRepoLabel,
  labelSourceAttribute,
} from "./label-source";

/**
 * #147: "Differentiate Kaneo native labels and repo labels".
 *
 * These assert the decision the shipped chip actually makes — the component
 * imports these same functions — so a regression in the mapping fails here
 * rather than silently marking every label as native.
 */
describe("#147 label source distinction", () => {
  it("hides repo labels from normal tickets but allows synced tickets", () => {
    expect(canSelectLabelSource("repo", false)).toBe(false);
    expect(canSelectLabelSource("repo", true)).toBe(true);
    expect(canSelectLabelSource("kaneo", false)).toBe(true);
  });
  it("marks repo-sourced labels", () => {
    expect(isRepoLabel("repo")).toBe(true);
    expect(labelSourceAttribute("repo")).toBe("repo");
  });

  it("does not mark Kaneo-native labels", () => {
    expect(isRepoLabel("kaneo")).toBe(false);
    expect(labelSourceAttribute("kaneo")).toBe("kaneo");
  });

  /**
   * Rows written before the column existed carry no source. They are native by
   * definition — the GitHub import is the only writer of "repo" — so they must
   * not be marked as coming from a repository.
   */
  it("treats a missing source as native, never as repo", () => {
    expect(isRepoLabel(undefined)).toBe(false);
    expect(isRepoLabel(null)).toBe(false);
    expect(labelSourceAttribute(undefined)).toBe("kaneo");
    expect(labelSourceAttribute(null)).toBe("kaneo");
  });

  // Guards against a truthiness check creeping in: only the exact value counts.
  it("only the exact value 'repo' counts as repo-sourced", () => {
    for (const value of ["", "github", "REPO", "gitea", "repository"]) {
      expect(isRepoLabel(value)).toBe(false);
    }
  });
});
