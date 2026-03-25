const {
  getLatestReleaseTag,
  getTagFromBranchName,
} = require("../libs/git-utils");

test("getLatestReleaseTag fails when no release branches are found", async () => {
  const mockOctokit = {
    request: jest.fn().mockResolvedValue({
      data: [{ name: "main" }, { name: "develop" }],
    }),
  };

  await getLatestReleaseTag(mockOctokit, "owner", "repo");
  expect(require("@actions/core").setFailed).toHaveBeenCalledWith(
    "No release branches found matching pattern 'releases/v*.*.*'",
  );
});

test("getLatestReleaseTag returns the latest release tag", async () => {
  const mockOctokit = {
    request: jest.fn().mockResolvedValue({
      data: [
        { name: "releases/v1.0.0" },
        { name: "releases/v1.2.0" },
        { name: "releases/v1.2.1" },
        { name: "releases/v1.1.0" },
        { name: "releases/v1.1.1" },
        { name: "main" },
        { name: "develop" },
      ],
    }),
  };

  const latestTag = await getLatestReleaseTag(mockOctokit, "owner", "repo");
  expect(latestTag).toBe("releases/v1.2.1");
});

test("getTagFromBranchName extracts the tag from a branch name", () => {
  const branchName = "releases/v1.2.1";
  const tag = getTagFromBranchName(branchName);
  expect(tag).toBe("v1.2.1");
});

test("getTagFromBranchName returns null for non-matching branch names", () => {
  expect(getTagFromBranchName("main")).toBeNull();
  expect(getTagFromBranchName("develop")).toBeNull();
  expect(getTagFromBranchName("releases/v1.2")).toBeNull();
  expect(getTagFromBranchName("releases/v1.2.1-beta")).toBeNull();
});
