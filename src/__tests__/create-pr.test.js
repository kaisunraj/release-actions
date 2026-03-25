const { run, _createPullRequest, _checkExistingPr } = require("../create-pr");

test("create pull request successfully", async () => {
  const mockOctokit = {
    rest: {
      pulls: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({
          data: { html_url: "https://github.com/owner/repo/pull/2" },
        }),
      },
    },
  };
  await _createPullRequest(
    mockOctokit,
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

test("run executes the full workflow successfully", async () => {
  await run();

  expect(require("@actions/core").getInput).toHaveBeenCalledWith(
    "github-token",
    { required: true },
  );
  expect(require("@actions/core").getInput).toHaveBeenCalledWith(
    "base-branch",
    { required: true },
  );
  expect(require("@actions/core").getInput).toHaveBeenCalledWith(
    "target-branch",
    { required: true },
  );

  expect(require("@actions/github").rest.pulls.create).toHaveBeenCalledWith({
    owner: "owner",
    repo: "repo",
    title: "Main into Develop for Release v1.2.1",
    head: "develop",
    base: "main",
  });
});

test("checkExistingPr fails when an open PR already exists", async () => {
  const mockOctokit = {
    rest: {
      pulls: {
        list: jest.fn().mockResolvedValue({
          data: [{ html_url: "https://github.com/owner/repo/pull/1" }],
        }),
      },
    },
  };

  await _checkExistingPr(mockOctokit, "owner", "repo", "develop", "main");
  expect(require("@actions/core").setFailed).toHaveBeenCalledWith(
    "An open PR from 'develop' into 'main' already exists: https://github.com/owner/repo/pull/1",
  );
});
