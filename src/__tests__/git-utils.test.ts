import {
  getLatestReleaseTag,
  getTagFromBranchName,
  sortReleaseVersions,
} from "../libs/git-utils";
import * as core from "@actions/core";
import * as github from "@actions/github";

jest.mock("@actions/core");
jest.mock("@actions/github");

beforeEach(() => {
  jest.clearAllMocks();
});

const mockOctokit = github.getOctokit("fake-token");


describe("sortReleaseVersions", () => {
  it.each([
    ["v1.2.3", "v1.2.10", -7],
    ["v1.2.3", "v1.2.3-beta", - 1],
    ["v1.2.3-alpha", "v1.2.3-beta", - 1],
    ["v1.2", "v1.2.0", 0],
    ["v1.10.0", "v1.2.10", 8],
    ["v1785949032", "v1.2.3", 1785949031],
  ])(
    "compares version '%s' and '%s' and returns %d",
    (versionA, versionB, expected) => {
      const result = sortReleaseVersions(versionA, versionB);
      expect(result).toBe(expected);
    },
  );
}); 

test("sortReleaseVersions correctly sorts version strings", () => {
  const versions = [
    "releases/v1.2.3",
    "releases/v1.2",
    "releases/v1.10.0",
    "releases/v1.2.10",
    "releases/v2",
    "releases/v1.2.3-beta",
    "releases/v1785949032",
    "releases/v1.2.3-alpha",
    "releases/v2",
    "releases/v2.1.0",
    "releases/v1.2.3-rc.1",
  ];
  const expectedLinks = [
    "releases/v1.2",
    "releases/v1.2.3",
    "releases/v1.2.3-alpha",
    "releases/v1.2.3-beta",
    "releases/v1.2.3-rc.1",
    "releases/v1.2.10",
    "releases/v1.10.0",
    "releases/v2",
    "releases/v2",
    "releases/v2.1.0",
    "releases/v1785949032",
  ];
  const result = versions.sort(sortReleaseVersions);
  expect(result).toEqual(expectedLinks);
});

test("getLatestReleaseTag fails when no release branches are found", async () => {
  require("@actions/github").__setMockPaginate([
    { name: "main" },
    { name: "develop" },
  ]);

  await getLatestReleaseTag(mockOctokit as any, "owner", "repo");

  expect(core.setFailed).toHaveBeenCalledWith(
    "No release branches found matching pattern 'releases/v*.*.*'",
  );
});

test("getLatestReleaseTag returns the latest release tag", async () => {
  require("@actions/github").__setMockPaginate([
    { name: "releases/v1.0.0" },
    { name: "releases/v1.2.0" },
    { name: "releases/v1.2.1" },
    { name: "releases/v1.1.0" },
    { name: "releases/v1.1.1" },
    { name: "main" },
    { name: "develop" },
  ]);

  const latestTag = await getLatestReleaseTag(
    mockOctokit as any,
    "owner",
    "repo",
  );

  expect(latestTag).toBe("releases/v1.2.1");
});

describe("getTagFromBranchName extracts the tag from a branch name", () => {
  it.each([
    ["releases/v1.2.1", "v1.2.1"],
    ["releases/v2.0.0", "v2.0.0"],
    ["releases/v1.2.3-beta", "v1.2.3-beta"],
    ["releases/v1", "v1"],
    ["origin/releases/v1.2.1", "v1.2.1"],
    ["origin/develop", "develop"],
  ])(
    "returns the correct tag for branch name '%s'",
    (branchName, expectedTag) => {
      const tag = getTagFromBranchName(branchName);
      expect(tag).toBe(expectedTag);
    },
  );
});

describe("getTagFromBranchName returns null for non-matching branch names", () => {
  it.each(["main", "feature/OVP-1234"])(
    "returns null for branch name '%s'",
    (branchName) => {
      expect(() => getTagFromBranchName(branchName)).toThrow(
        `Branch name "${branchName}" does not match expected release branch pattern (e.g. releases/v1.2.3 or origin/releases/v1.2.3)`,
      );
    },
  );
});
