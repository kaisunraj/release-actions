import { run, _createPullRequest, _checkExistingPr } from "../create-pr";
import * as core from "@actions/core";
import * as github from "@actions/github";

jest.mock("@actions/core");
jest.mock("@actions/github");

beforeEach(() => {
  jest.clearAllMocks();
});

const mockOctokit = github.getOctokit("fake-token");

describe("_createPullRequest", () => {
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

describe("run", () => {
  it("executes the full workflow and creates a PR with the correct title", async () => {
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
    require("@actions/github").__setMockPullsList([
      { html_url: "https://github.com/owner/repo/pull/1" , state: "open" , head: { ref: "develop" }, base: { ref: "main" } },
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

describe("_checkExistingPr", () => {
  it("returns the PR url when an open PR already exists", async () => {
    require("@actions/github").__setMockPullsList([
      { html_url: "https://github.com/owner/repo/pull/1", state: "open", head: { ref: "develop" }, base: { ref: "main" } },
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
