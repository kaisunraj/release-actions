import { getLatestReleaseTag, getTagFromBranchName } from "../libs/git-utils";
import * as core from "@actions/core";

jest.mock("@actions/core");

const mockOctokit = {
  request: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("getLatestReleaseTag fails when no release branches are found", async () => {
  mockOctokit.request.mockResolvedValue({
    data: [{ name: "main" }, { name: "develop" }],
  });

  await getLatestReleaseTag(mockOctokit as any, "owner", "repo");

  expect(core.setFailed).toHaveBeenCalledWith(
    "No release branches found matching pattern 'releases/v*.*.*'",
  );
});

test("getLatestReleaseTag returns the latest release tag", async () => {
  mockOctokit.request.mockResolvedValue({
    data: [
      { name: "releases/v1.0.0" },
      { name: "releases/v1.2.0" },
      { name: "releases/v1.2.1" },
      { name: "releases/v1.1.0" },
      { name: "releases/v1.1.1" },
      { name: "main" },
      { name: "develop" },
    ],
  });

  const latestTag = await getLatestReleaseTag(mockOctokit as any, "owner", "repo");

  expect(latestTag).toBe("releases/v1.2.1");
});


describe("getTagFromBranchName extracts the tag from a branch name", () => {
  it.each([
    ["releases/v1.2.1", "v1.2.1"],
    ["releases/v2.0.0", "v2.0.0"],
  ])("returns the correct tag for branch name '%s'", (branchName, expectedTag) => {
    const tag = getTagFromBranchName(branchName);
    expect(tag).toBe(expectedTag);
  });
});


describe("getTagFromBranchName returns null for non-matching branch names", () => {
  it.each([
    "main",
    "develop",
    "releases/v1.2",
    "releases/v1.2.1-beta",
  ])("returns null for branch name '%s'", (branchName) => {
    expect(getTagFromBranchName(branchName)).toBeNull();
  });
});
