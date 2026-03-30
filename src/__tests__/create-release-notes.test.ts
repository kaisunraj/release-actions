jest.mock("node:child_process", () => ({
  exec: jest.fn(),
}));

const { exec: mockExec } = jest.requireMock("node:child_process") as {
  exec: jest.Mock;
};

import * as core from "@actions/core";

import {
  _createGithubRelease,
  _createRelease,
  _filterJiraTickets,
  _generateJiraLinks,
  _generateReleaseNotes,
  _generateReleaseNotesContent,
  _getCommitMessages,
  _listBranches,
  _releaseExists,
} from "../create-release-notes";

test("Listing branches", () => {
  const branches = [
    "main",
    "releases/v1.0.0",
    "releases/v1.1.0",
    "feature/new-feature",
  ];
  mockExec.mockImplementation((command, callback) => {
    callback(null, branches.join("\n"), "");
  });
  const result = _listBranches();
  return expect(result).resolves.toEqual(branches);
});

test("Listing branches with error", () => {
  mockExec.mockImplementation((command, callback) => {
    callback(new Error("Git error"), "", "Git error");
  });
  const result = _listBranches();
  return expect(result).rejects.toThrow("Error listing branches: Git error");
});

test("Listing branches with stderr", () => {
  mockExec.mockImplementation((command, callback) => {
    callback(null, "", "Git error");
  });
  const result = _listBranches();
  return expect(result).rejects.toThrow("Error output: Git error");
});

test("Getting commit messages", () => {
  const commitMessages = [
    "feat: add new feature OVP-1234",
    "fix: bug fix OVP-5678",
    "chore: update dependencies",
    "refactor: improve code structure OVP-9012",
    "docs: update README OVP-3456",
  ];
  mockExec.mockImplementation((command, callback) => {
    callback(null, commitMessages.join("\n"), "");
  });
  const result = _getCommitMessages("main", "releases/v1.0.0");
  return expect(result).resolves.toEqual(commitMessages);
});

test("Getting commit messages with error", () => {
  mockExec.mockImplementation((command, callback) => {
    callback(new Error("Git error"), "", "Git error");
  });
  const result = _getCommitMessages("main", "releases/v1.0.0");
  return expect(result).rejects.toThrow(
    "Error fetching commit messages: Git error",
  );
});

test("Getting commit messages with stderr", () => {
  mockExec.mockImplementation((command, callback) => {
    callback(null, "", "Git error");
  });
  const result = _getCommitMessages("main", "releases/v1.0.0");
  return expect(result).rejects.toThrow("Error output: Git error");
});

test("Filtering Jira tickets from commit messages", () => {
  const commitMessages = [
    "feat: add new feature OVP-1234",
    "fix: bug fix OVP-5678",
    "chore: update dependencies",
    "refactor: improve code structure OVP-9012",
    "docs: update README OVP-3456",
  ];
  const expectedTickets = ["OVP-1234", "OVP-5678", "OVP-9012", "OVP-3456"];
  const result = _filterJiraTickets(commitMessages);
  expect(result).toEqual(expectedTickets);
});

test("Generating jira links from tickets", () => {
  const tickets = ["OVP-1234", "OVP-5678"];
  const confluenceSpace = "example";
  const expectedLinks = [
    "https://example.atlassian.net/browse/OVP-1234",
    "https://example.atlassian.net/browse/OVP-5678",
  ];
  const result = _generateJiraLinks(confluenceSpace, tickets);
  expect(result).toEqual(expectedLinks);
});

test("Test release exists returns false when release does not exist", async () => {
  const mockOctokit = {
    request: jest.fn().mockRejectedValue({ status: 404 }),
  };
  const result = await _releaseExists(
    mockOctokit as any,
    "owner",
    "repo",
    "tag",
  );
  expect(result).toBe(false);
});

test("Test release exists returns id when release exists", async () => {
  const mockOctokit = {
    request: jest.fn().mockResolvedValue({ data: { id: 123 } }),
  };
  const result = await _releaseExists(
    mockOctokit as any,
    "owner",
    "repo",
    "tag",
  );
  expect(result).toBe(123);
});

test("Test releaseExists throws error on unexpected error", async () => {
  const mockOctokit = {
    request: jest
      .fn()
      .mockRejectedValue({ status: 500, message: "Server error" }),
  };
  await expect(
    _releaseExists(mockOctokit as any, "owner", "repo", "tag"),
  ).rejects.toEqual({ status: 500, message: "Server error" });
});

test("Test create release returns id", async () => {
  const mockOctokit = {
    request: jest.fn().mockResolvedValue({ data: { id: 456 } }),
  };
  const result = await _createRelease(
    mockOctokit as any,
    "owner",
    "repo",
    "tag",
    "releaseBranch",
    "body",
  );
  expect(result).toBe(456);
});

test("Testing generateReleaseNotesContent with no links", () => {
  const content = _generateReleaseNotesContent([]);
  expect(content).toBe("No Jira tickets found for this release.");
});

test("Testing generateReleaseNotesContent with multiple links", () => {
  const links = [
    "https://example.atlassian.net/browse/OVP-123",
    "https://example.atlassian.net/browse/OVP-456",
    "https://example.atlassian.net/browse/OVP-789",
  ];
  const content = _generateReleaseNotesContent(links);
  expect(content).toBe(
    "Jira Tickets:\n- https://example.atlassian.net/browse/OVP-123\n- https://example.atlassian.net/browse/OVP-456\n- https://example.atlassian.net/browse/OVP-789",
  );
});

test("createGithubRelease when release exists", async () => {
  const mockOctokit = {
    request: jest.fn().mockResolvedValue({ data: { id: 789 } }),
  };
  const result = await _createGithubRelease(
    mockOctokit as any,
    "owner",
    "repo",
    "v1.0.0",
    "releases/v1.0.0",
    "Release notes content",
  );
  expect(result).toBe(789);
});

test("createGithubRelease when release does not exist", async () => {
  const mockOctokit = {
    request: jest
      .fn()
      .mockRejectedValueOnce({ status: 404 }) // release doesnt exist
      .mockResolvedValueOnce({ data: { id: 123 } }), // createRelease
  };
  const result = await _createGithubRelease(
    mockOctokit as any,
    "owner",
    "repo",
    "v1.0.0",
    "releases/v1.0.0",
    "Release notes content",
  );
  expect(result).toBe(123);
});

test("Testing generateReleaseNotes release exists", async () => {
  mockExec.mockImplementation((command, callback) => {
    callback(null, "OVP-1: one\nOVP-2: two\n", "");
  });
  const mockOctokit = {
    request: jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 123 } }) // releaseExists
      .mockResolvedValueOnce({ data: { id: 123 } }), // updateRelease
  };
  return expect(
    _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "releases/v1.0.0",
    ),
  ).resolves.toBe(123);
});

test("Testing generateReleaseNotes release does not exist", async () => {
  mockExec.mockImplementation((command, callback) => {
    callback(null, "OVP-1: one\nOVP-2: two\n", "");
  });
  const mockOctokit = {
    request: jest
      .fn()
      .mockRejectedValueOnce({ status: 404 }) // releaseExists
      .mockResolvedValueOnce({ data: { id: 456 } }), // createRelease
  };
  return expect(
    _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "releases/v1.0.0",
    ),
  ).resolves.toBe(456);
});

test("Testing generateReleaseNotes with no Jira tickets", async () => {
  mockExec.mockImplementation((command, callback) => {
    callback(null, "chore: update dependencies\n", "");
  });
  const mockOctokit = {
    request: jest.fn(),
  };
  return expect(
    _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "releases/v1.0.0",
    ),
  ).resolves.toBeUndefined();
});

test("Generate release notes with createGithubReleaseTag false does not call createGithubRelease", async () => {
  mockExec.mockImplementation((command, callback) => {
    callback(null, "OVP-1: one\nOVP-2: two\n", "");
  });
  const mockOctokit = {
    request: jest.fn(),
  };
  const result = await _generateReleaseNotes(
    mockOctokit as any,
    "owner",
    "repo",
    "confluenceSpace",
    "main",
    "releases/v1.0.0",
    false, // createGithubReleaseTag
  );
  expect(mockOctokit.request).not.toHaveBeenCalled();
  expect(core.notice).toHaveBeenCalled();
});
