jest.mock("child_process", () => ({
  exec: jest.fn(),
}));
const { exec: mockExec } = jest.requireMock("child_process") as {
  exec: jest.Mock;
};

import * as core from "@actions/core";
import * as github from "@actions/github";

jest.mock("@actions/core");
jest.mock("@actions/github");

const mockOctokit: any = github.getOctokit("fake-token");

import {
  extractVersionParts,
  getLatestReleaseTag,
  getTagFromBranchName,
  listBranches,
  sortReleaseVersions,
  releaseExists,
  createRelease,
  createGithubRelease,
  publishPrerelease,
  publishLatestRelease,
  getTag,
  getLatestPreRelease,
} from "../libs/git-utils";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("extractVersionParts", () => {
  it.each([
    ["v1.2.3", [1, 2, 3]],
    ["releases/v1.2.3", [1, 2, 3]],
    ["v1.2.3-beta", [1, 2, 3, "beta"]],
    ["v1.2", [1, 2]],
    ["v1.2.3-rc.1", [1, 2, 3, "rc", 1]],
    ["releases/v1.2.3-alpha", [1, 2, 3, "alpha"]],
    ["v1785949032", [1785949032]],
  ])("extracts version parts from '%s'", (version, expectedParts) => {
    const parts = extractVersionParts(version);
    expect(parts).toEqual(expectedParts);
  });
});

describe("sortReleaseVersions", () => {
  it.each([
    ["v1.2.3", "v1.2.10", -7],
    ["v1.2.3", "v1.2.3-beta", -1],
    ["v1.2.3-alpha", "v1.2.3-beta", -1],
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

  it("correctly sorts an array of version strings", () => {
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
});

describe("getLatestReleaseTag", () => {
  it("calls setFailed when no release branches are found", async () => {
    require("@actions/github").__setMockPaginate([
      { name: "main" },
      { name: "develop" },
    ]);

    await getLatestReleaseTag(mockOctokit as any, "owner", "repo");

    expect(core.setFailed).toHaveBeenCalledWith(
      "No release branches found matching pattern 'releases/v*.*.*'",
    );
  });

  it("returns the latest release tag", async () => {
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
});

describe("getTagFromBranchName", () => {
  it.each([
    ["releases/v1.2.1", "v1.2.1"],
    ["releases/v2.0.0", "v2.0.0"],
    ["releases/v1.2.3-beta", "v1.2.3-beta"],
    ["releases/v1", "v1"],
    ["origin/releases/v1.2.1", "v1.2.1"],
  ])("extracts tag from branch name '%s'", (branchName, expectedTag) => {
    const tag = getTagFromBranchName(branchName);
    expect(tag).toBe(expectedTag);
  });

  it.each(["main", "feature/OVP-1234"])(
    "throws when branch name '%s' does not match the release branch pattern",
    (branchName) => {
      expect(() => getTagFromBranchName(branchName)).toThrow(
        `Branch name "${branchName}" does not match expected release branch pattern (e.g. releases/v1.2.3 or origin/releases/v1.2.3)`,
      );
    },
  );
});

describe("getTag", () => {
  it("return tag extracted from branch name when it is a release branch", async () => {
    const branchName = "releases/v1.2.3";
    const tag = await getTag(mockOctokit as any, "owner", "repo", branchName);
    expect(tag).toBe("v1.2.3");
  });

  it("returns the next patch version when branch is develop", async () => {
    const branchName = "develop";
    const mockBranches = [
      { name: "releases/v1.2.3" },
      { name: "releases/v1.2.4" },
      { name: "releases/v1.3.0" },
    ];
    require("@actions/github").__setMockListBranches(mockBranches);
    const tag = await getTag(mockOctokit as any, "owner", "repo", branchName);
    expect(tag).toBe("v1.3.0");
  });
});

describe("getLatestPrereleaseRelease", () => {
  it("returns the id of the latest prerelease release", async () => {
    const mockReleases = [
      { id: 1, prerelease: false, tag_name: "v1.0.0" },
      { id: 2, prerelease: true, tag_name: "v1.1.0" },
      { id: 3, prerelease: true, tag_name: "v1.2.0" },
      { id: 4, prerelease: false, tag_name: "v1.3.0" },
    ];
    require("@actions/github").__setMockPaginate(mockReleases);
    const latestPrereleaseRelease = await getLatestPreRelease(
      mockOctokit as any,
      "owner",
      "repo",
    );
    expect(latestPrereleaseRelease).toEqual({
      id: 2,
      prerelease: true,
      tag_name: "v1.1.0",
    });
  });

  it("returns undefined when no releases are found", async () => {
    require("@actions/github").__setMockPaginate(undefined);
    const latestPrereleaseRelease = await getLatestPreRelease(
      mockOctokit as any,
      "owner",
      "repo",
    );
    expect(latestPrereleaseRelease).toBeUndefined();
  });

  it("returns undefined if no draft releases are found", async () => {
    require("@actions/github").__setMockPaginate([
      { tag_name: "v1.0.0", id: 789, draft: false },
      { tag_name: "v1.0.1", id: 790, draft: false },
    ]);
    const latestPrereleaseReleaseId = await getLatestPreRelease(
      mockOctokit as any,
      "owner",
      "repo",
    );
    expect(latestPrereleaseReleaseId).toBeUndefined();
  });
});

describe("listBranches", () => {
  it("resolves with a list of branch names when exec succeeds", () => {
    const branches = [
      "main",
      "releases/v1.0.0",
      "releases/v1.1.0",
      "feature/new-feature",
    ];
    mockExec.mockImplementation((command, callback) => {
      callback(null, branches.join("\n"), "");
    });
    const result = listBranches();
    return expect(result).resolves.toEqual(branches);
  });

  it("rejects with an error message when exec fails", () => {
    mockExec.mockImplementation((command, callback) => {
      callback(new Error("Git error"), "", "Git error");
    });
    const result = listBranches();
    return expect(result).rejects.toThrow("Error listing branches: Git error");
  });

  it("rejects with a stderr message when exec writes to stderr", () => {
    mockExec.mockImplementation((command, callback) => {
      callback(null, "", "Git error");
    });
    const result = listBranches();
    return expect(result).rejects.toThrow("Error output: Git error");
  });
});

describe("releaseExists", () => {
  it("returns undefined when the release does not exist (404)", async () => {
    mockOctokit.request.mockRejectedValue({ status: 404 });
    const result = await releaseExists(
      mockOctokit as any,
      "owner",
      "repo",
      "tag",
    );
    expect(result).toBe(undefined);
  });

  it("returns the release id when the release exists", async () => {
    mockOctokit.request.mockResolvedValue({
      data: { id: 123, prerelease: true },
    });
    const result = await releaseExists(
      mockOctokit as any,
      "owner",
      "repo",
      "tag",
    );
    expect(result).toEqual({ id: 123, prerelease: true });
  });

  it("throws on non-404 errors", async () => {
    mockOctokit.request.mockRejectedValue({
      status: 500,
      message: "Server error",
    });
    await expect(
      releaseExists(mockOctokit as any, "owner", "repo", "tag"),
    ).rejects.toEqual({ status: 500, message: "Server error" });
  });
});

describe("createRelease", () => {
  it("returns the id of the newly created release", async () => {
    mockOctokit.request.mockResolvedValue({ data: { id: 456 } });
    const result = await createRelease(
      mockOctokit as any,
      "owner",
      "repo",
      "tag",
      "releaseBranch",
      "body",
    );
    expect(result).toEqual({ id: 456 });
  });
});

describe("publishDraftRelease", () => {
  it("returns the response from the API when publishing succeeds", async () => {
    mockOctokit.request.mockResolvedValue({ data: { id: 789 } });
    const result = await publishPrerelease(
      mockOctokit as any,
      "owner",
      "repo",
      789,
    );
    expect(result).toEqual({ data: { id: 789 } });
  });
});

describe("createGithubRelease", () => {
  it("returns the existing release id when the release already exists", async () => {
    const mockOctokit = {
      request: jest.fn().mockResolvedValue({ data: { id: 789 } }),
    };
    const result = await createGithubRelease(
      mockOctokit as any,
      "owner",
      "repo",
      "v1.0.0",
      "releases/v1.0.0",
      "Release notes content",
    );
    expect(result).toEqual(789);
  });

  it("creates and returns a new release id when the release does not exist", async () => {
    const mockOctokit = {
      request: jest
        .fn()
        .mockRejectedValueOnce({ status: 404 }) // release doesnt exist
        .mockResolvedValueOnce({ data: { id: 123 } }), // createRelease
    };
    const result = await createGithubRelease(
      mockOctokit as any,
      "owner",
      "repo",
      "v1.0.0",
      "releases/v1.0.0",
      "Release notes content",
    );
    expect(result).toBe(123);
  });
});

describe("publishLatestRelease", () => {
  it("returns undefined when no prerelease releases are found", async () => {
    require("@actions/github").__setMockPaginate([
      { tag_name: "v1.0.0", id: 789, prerelease: false },
      { tag_name: "v1.0.1", id: 790, prerelease: false },
    ]);
    const result = await publishLatestRelease(
      mockOctokit as any,
      "owner",
      "repo",
    );
    expect(result).toBeUndefined();
  });

  it("publishes the latest prerelease and returns its id", async () => {
    require("@actions/github").__setMockPaginate([
      { tag_name: "v1.0.0", id: 789, prerelease: false },
      { tag_name: "v1.0.3", id: 792, prerelease: true },
      { tag_name: "v1.0.2", id: 791, prerelease: true },
      { tag_name: "v1.0.1", id: 790, prerelease: false },
    ]);
    mockOctokit.request.mockResolvedValueOnce({ data: { id: 792 } });

    const result = await publishLatestRelease(
      mockOctokit as any,
      "owner",
      "repo",
    );
    expect(result).toEqual(791);
  });
});
