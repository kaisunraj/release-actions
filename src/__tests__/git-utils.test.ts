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

test("getTagFromBranchName extracts the tag from a branch name", () => {
  const tag = getTagFromBranchName("releases/v1.2.1");
  expect(tag).toBe("v1.2.1");
});

test("getTagFromBranchName returns null for non-matching branch names", () => {
  expect(getTagFromBranchName("main")).toBeNull();
  expect(getTagFromBranchName("develop")).toBeNull();
  expect(getTagFromBranchName("releases/v1.2")).toBeNull();
  expect(getTagFromBranchName("releases/v1.2.1-beta")).toBeNull();
});
