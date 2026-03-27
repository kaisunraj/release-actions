import { run, _createPullRequest, _checkExistingPr } from "../create-pr";
import * as core from "@actions/core";
import * as github from "@actions/github";

jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../libs/git-utils");

const mockOctokitBase = {
  rest: {
    pulls: {
      list: jest.fn(),
      create: jest.fn(),
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("create pull request successfully", async () => {
  mockOctokitBase.rest.pulls.create.mockResolvedValue({
    data: { html_url: "https://github.com/owner/repo/pull/2" },
  });

  await _createPullRequest(
    mockOctokitBase as any,
    "Release releases/v1.2.1",
    "main",
    "develop",
    "owner",
    "repo",
  );

  expect(mockOctokitBase.rest.pulls.create).toHaveBeenCalledWith({
    owner: "owner",
    repo: "repo",
    title: "Release releases/v1.2.1",
    head: "develop",
    base: "main",
  });
});

test("run executes the full workflow successfully", async () => {
  (core.getInput as jest.Mock).mockImplementation((key: string) => {
    const inputs: Record<string, string> = {
      "github-token": "mock-token",
      "base-branch": "main",
      "target-branch": "develop",
    };
    return inputs[key] ?? "";
  });

  (github.context as any).repo = { owner: "owner", repo: "repo" };

  mockOctokitBase.rest.pulls.list.mockResolvedValue({ data: [] });
  mockOctokitBase.rest.pulls.create.mockResolvedValue({
    data: { html_url: "https://github.com/owner/repo/pull/2" },
  });

  (github.getOctokit as jest.Mock).mockReturnValue(mockOctokitBase);

  const { getLatestReleaseTag, getTagFromBranchName } = require("../libs/git-utils");
  getLatestReleaseTag.mockResolvedValue("releases/v1.2.1");
  getTagFromBranchName.mockReturnValue("v1.2.1");

  await run();

  expect(core.getInput).toHaveBeenCalledWith("github-token", { required: true });
  expect(core.getInput).toHaveBeenCalledWith("base-branch", { required: true });
  expect(core.getInput).toHaveBeenCalledWith("target-branch", { required: true });

  expect(mockOctokitBase.rest.pulls.create).toHaveBeenCalledWith({
    owner: "owner",
    repo: "repo",
    title: "Main into Develop for Release v1.2.1",
    head: "develop",
    base: "main",
  });
});

test("Run does not create PR if one already exists", async () => {
  (core.getInput as jest.Mock).mockImplementation((key: string) => {
    const inputs: Record<string, string> = {
      "github-token": "mock-token",
      "base-branch": "main",
      "target-branch": "develop",
    };
    return inputs[key] ?? "";
  });

  (github.context as any).repo = { owner: "owner", repo: "repo" };

  mockOctokitBase.rest.pulls.list.mockResolvedValue({
    data: [{ html_url: "https://github.com/owner/repo/pull/1" }],
  });

  await run();

  expect(mockOctokitBase.rest.pulls.create).not.toHaveBeenCalled();
});

test("checkExistingPr fails when an open PR already exists", async () => {
  mockOctokitBase.rest.pulls.list.mockResolvedValue({
    data: [{ html_url: "https://github.com/owner/repo/pull/1" }],
  });

  const result = await _checkExistingPr(mockOctokitBase as any, "owner", "repo", "develop", "main");
  expect(result).toBe("https://github.com/owner/repo/pull/1");
});

test("checkExistingPr returns null when no open PR exists", async () => {
  mockOctokitBase.rest.pulls.list.mockResolvedValue({ data: [] });

  const result = await _checkExistingPr(mockOctokitBase as any, "owner", "repo", "develop", "main");
  expect(result).toBeUndefined();
});