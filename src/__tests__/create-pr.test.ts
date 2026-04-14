import * as core from "@actions/core";
import * as github from "@actions/github";

jest.mock("@actions/core");
jest.mock("@actions/github");

const mockOctokit: any = github.getOctokit("fake-token");

import {
  run,
  _createPullRequest,
  _checkExistingPr,
  _checkMergeConflicts,
  _getBranchHeadSha,
  _createConflictResolutionBranch,
} from "../create-pr";

beforeEach(() => {
  jest.clearAllMocks();
  mockOctokit.request.mockReset();
  mockOctokit.paginate.mockReset();
});

describe("createPullRequest", () => {
  it("calls pulls.create with the correct arguments", async () => {
    await _createPullRequest(
      mockOctokit as any,
      "Release releases/v1.2.1",
      "main",
      "develop",
      "owner",
      "repo",
    );

    expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      title: "Release releases/v1.2.1",
      head: "develop",
      base: "main",
    });
  });
});

describe("checkMergeConflicts", () => {
  it.each([
    ["diverged", true],
    ["ahead", false],
    ["behind", false],
    ["identical", false],
  ])(
    "returns %s when merge conflicts are detected",
    async (status, expected) => {
      mockOctokit.request.mockResolvedValue({
        data: {
          status: status,
        },
      });

      const result = await _checkMergeConflicts(
        mockOctokit as any,
        "owner",
        "repo",
        "main",
        "develop",
      );
      expect(result).toBe(expected);
      expect(mockOctokit.request).toHaveBeenCalledWith(
        "GET /repos/{owner}/{repo}/compare/{base}...{head}",
        {
          owner: "owner",
          repo: "repo",
          base: "main",
          head: "develop",
          headers: {
            "X-GitHub-Api-Version": "2026-03-10",
          },
        },
      );
    },
  );
});

describe("getBranchHeadSha", () => {
  it("returns the head SHA of the specified branch", async () => {
    mockOctokit.request.mockResolvedValue({
      data: {
        commit: {
          sha: "fake-sha",
        },
      },
    });

    const result = await _getBranchHeadSha(
      mockOctokit as any,
      "owner",
      "repo",
      "develop",
    );
    expect(result).toBe("fake-sha");
    expect(mockOctokit.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/branches/{branch}",
      {
        owner: "owner",
        repo: "repo",
        branch: "develop",
        headers: {
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );
  });
});

describe("createConflictResolutionBranch", () => {
  it("creates a new branch for conflict resolution", async () => {
    mockOctokit.request.mockResolvedValue({
      data: {
        commit: {
          sha: "fake-sha",
        },
      },
    });

    const result = await _createConflictResolutionBranch(
      mockOctokit as any,
      "owner",
      "repo",
      "main",
      "develop",
      "releases/v1.2.1",
    );
    expect(result).toBe(
      "feature/OVP-0000-conflict-resolution-develop-into-main-for-v1.2.1",
    );
    expect(mockOctokit.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/git/refs",
      {
        owner: "owner",
        repo: "repo",
        ref: "refs/heads/feature/OVP-0000-conflict-resolution-develop-into-main-for-v1.2.1",
        sha: "fake-sha",
        headers: {
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );
  });
});

describe("run", () => {
  it("executes the full workflow and creates a PR with the correct title", async () => {
    mockOctokit.request.mockResolvedValueOnce({
      data: {
        status: "ahead",
      },
    });
    require("@actions/github").__setMockPaginate([
      { name: "releases/v1.0.0" },
      { name: "releases/v1.2.0" },
      { name: "releases/v1.2.1" },
      { name: "releases/v1.1.0" },
      { name: "releases/v1.1.1" },
      { name: "main" },
      { name: "develop" },
    ]);
    await run();

    expect(core.getInput).toHaveBeenCalledWith("github-token", {
      required: true,
    });
    expect(core.getInput).toHaveBeenCalledWith("base-branch", {
      required: true,
    });
    expect(core.getInput).toHaveBeenCalledWith("target-branch", {
      required: true,
    });

    expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      title: "Main into Develop for Release v1.2.1",
      head: "develop",
      base: "main",
    });
  });

  it("does not create a PR when one already exists", async () => {
    mockOctokit.request.mockResolvedValueOnce({
      data: {
        status: "ahead",
      },
    });
    
    require("@actions/github").__setMockPaginate([
      { name: "releases/v1.0.0" },
      { name: "releases/v1.2.0" },
      { name: "releases/v1.2.1" },
      { name: "releases/v1.1.0" },
      { name: "releases/v1.1.1" },
      { name: "main" },
      { name: "develop" },
    ]);
    require("@actions/github").__setMockPullsList([
      {
        html_url: "https://github.com/owner/repo/pull/1",
        state: "open",
        head: { ref: "develop" },
        base: { ref: "main" },
      },
    ]);

    await run();

    expect(mockOctokit.rest.pulls.create).not.toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      title: "Main into Develop for Release v999.9.9",
      head: "develop",
      base: "main",
    });
  });
});

describe("checkExistingPr", () => {
  it("returns the PR url when an open PR already exists", async () => {
    require("@actions/github").__setMockPullsList([
      {
        html_url: "https://github.com/owner/repo/pull/1",
        state: "open",
        head: { ref: "develop" },
        base: { ref: "main" },
      },
    ]);

    const result = await _checkExistingPr(
      mockOctokit as any,
      "owner",
      "repo",
      "develop",
      "main",
    );
    expect(result).toBe("https://github.com/owner/repo/pull/1");
  });

  it("returns undefined when no open PR exists", async () => {
    require("@actions/github").__setMockPullsList([]);

    const result = await _checkExistingPr(
      mockOctokit as any,
      "owner",
      "repo",
      "develop",
      "main",
    );
    expect(result).toBeUndefined();
  });
});
