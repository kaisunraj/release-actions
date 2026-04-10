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
  _filterJiraTickets,
  _generateJiraLinks,
  _generateReleaseNotes,
  _generateReleaseNotesContent,
  _getMergedBranchNames,
  _getTicketsBetweenBranches,
} from "../create-release-notes";
import { mock } from "node:test";

beforeEach(() => {
  jest.clearAllMocks();
  mockOctokit.request.mockReset();
  mockOctokit.paginate.mockReset();
});

describe("_filterJiraTickets", () => {
  it("extracts Jira ticket IDs from commit messages", () => {
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
});

describe("_getMergedBranchNames", () => {
  it("extracts PR numbers from commit messages and retrieves merged branch names", async () => {
    const commits = [
      { commit: { message: "Merge pull request (#42) from feature/awesome" } },
      { commit: { message: "Merge pull request #99 from bugfix/critical" } },
      { commit: { message: "chore: update dependencies" } },
    ];

    mockOctokit.request.mockImplementation((url: string, options: any) => {
      if (url === "GET /repos/{owner}/{repo}/pulls/{pull_number}") {
        if (options.pull_number === 42) {
          return Promise.resolve({
            data: { head: { ref: "feature/awesome" } },
          });
        } else if (options.pull_number === 99) {
          return Promise.resolve({
            data: { head: { ref: "bugfix/critical" } },
          });
        }
      }
      return Promise.reject(new Error("Unexpected API call"));
    });

    const result = await _getMergedBranchNames(
      mockOctokit,
      "owner",
      "repo",
      commits,
    );
    expect(result).toEqual(["feature/awesome", "bugfix/critical"]);
  });
});

describe("_generateJiraLinks", () => {
  it("generates Atlassian browse URLs for each ticket", () => {
    const tickets = ["OVP-1234", "OVP-5678"];
    const confluenceSpace = "example";
    const expectedLinks = [
      "https://example.atlassian.net/browse/OVP-1234",
      "https://example.atlassian.net/browse/OVP-5678",
    ];
    const result = _generateJiraLinks(confluenceSpace, tickets);
    expect(result).toEqual(expectedLinks);
  });
});

describe("getTicketsBetweenBranches", () => {
  it("returns a list of Jira tickets between the release branch and base branch", async () => {
    mockOctokit.request.mockResolvedValueOnce({
      data: {
        commits: [
          {
            commit: { message: "Merge pull request #42 from feature/OVP-1234" },
          },
          {
            commit: { message: "Merge pull request #99 from feature/OVP-5678" },
          },
          { commit: { message: "New feature (#100)" } },
        ],
      },
    });
    mockOctokit.request.mockImplementation((url: string, options: any) => {
      if (url === "GET /repos/{owner}/{repo}/pulls/{pull_number}") {
        if (options.pull_number === 42) {
          return Promise.resolve({
            data: { head: { ref: "feature/OVP-1234" } },
          });
        } else if (options.pull_number === 99) {
          return Promise.resolve({
            data: { head: { ref: "feature/OVP-5678" } },
          });
        } else if (options.pull_number === 100) {
          return Promise.resolve({
            data: { head: { ref: "feature/OVP-9012" } },
          });
        }
      }
      return Promise.reject(new Error("Unexpected API call"));
    });
    const result = await _getTicketsBetweenBranches(
      mockOctokit as any,
      "owner",
      "repo",
      "releases/v1.0.0",
      "develop",
    );
    expect(result).toEqual(["OVP-1234", "OVP-5678", "OVP-9012"]);
  });
});

describe("_generateReleaseNotesContent", () => {
  it("returns a 'no tickets found' message when given an empty list", () => {
    const content = _generateReleaseNotesContent([]);
    expect(content).toBe("No Jira tickets found for this release.");
  });

  it("returns a formatted list of Jira links", () => {
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
});

describe("generateReleaseNotes", () => {
  function setupMock() {
    mockOctokit.request
      .mockResolvedValueOnce({
        data: {
          commits: [
            { commit: { message: "Merge pull request from feature/OVP-1234" } },
            { commit: { message: "Merge pull request from feature/OVP-5678" } },
            { commit: { message: "New feature (#100)" } },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: { head: { ref: "feature/OVP-9012" } },
      }); // PR #42
  }

  it("updates the existing release and returns its id", async () => {
    setupMock();
    mockOctokit.request
      .mockResolvedValueOnce({ data: { id: 123 } }) // releaseExists
      .mockResolvedValueOnce({ data: { id: 123 } }); // updateRelease
    expect(
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

  it("creates a new release and returns its id when none exists", async () => {
    setupMock();
    mockOctokit.request
      .mockRejectedValueOnce({ status: 404 }) // releaseExists
      .mockResolvedValueOnce({ data: { id: 456 } }); // createRelease
    expect(
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

  it("resolves with undefined when no Jira tickets are found in commit messages", async () => {
    mockOctokit.request.mockResolvedValueOnce({
      data: {
        commits: [
          { commit: { message: "chore: update dependencies" } },
          { commit: { message: "docs: update README" } },
        ],
      },
    });
    expect(
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

  it("returns the latest draft release id and publishes it when base and release branches are the same", async () => {
    setupMock();
    require("@actions/github").__setMockPaginate([
      { tag_name: "v1.0.0", id: 789, draft: false },
      { tag_name: "v1.0.3", id: 792, draft: true },
      { tag_name: "v1.0.2", id: 791, draft: true },
      { tag_name: "v1.0.1", id: 790, draft: false },
    ]);
    mockOctokit.request.mockResolvedValueOnce({ data: { id: 792 } });

    const result = await _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "main", // baseBranch and releaseBranch are the same
    );

    expect(result).toBe(792);
    expect(mockOctokit.request).toHaveBeenCalledWith(
      "PATCH /repos/{owner}/{repo}/releases/{release_id}",
      expect.objectContaining({ release_id: 792, draft: false }),
    );
  });

  it("does not call createGithubRelease and writes a job summary when createGithubReleaseTag is false", async () => {
    setupMock();
    const result = await _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "releases/v1.0.0",
      false, // createGithubReleaseTag
    );
    expect(mockOctokit.request).not.toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/releases",
    );
    expect(core.summary.addHeading).toHaveBeenCalledWith(
      "Release notes for tag v1.0.0",
    );
    expect(core.summary.addList).toHaveBeenCalledWith([
      "https://confluenceSpace.atlassian.net/browse/OVP-1234",
      "https://confluenceSpace.atlassian.net/browse/OVP-5678",
      "https://confluenceSpace.atlassian.net/browse/OVP-9012",
    ]);
  });

  it("creates the latest release branch as a draft release when base and release branches are the same", async () => {
    require("@actions/github").__setMockPaginate([
      { tag_name: "v1.0.0", id: 789, draft: false },
      { tag_name: "v1.0.1", id: 790, draft: false },
    ]);

    const result = await _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "main", // releaseBranch is the same as baseBranch
    );
    expect(result).toBeUndefined();
  });

  it("New release is create with next minor version when release branch is develop and createGithubReleaseTag is true", async () => {
    require("@actions/github").__setMockPaginate([
      { name: "releases/v1.0.0", id: 789, draft: false },
      { name: "releases/v1.0.1", id: 790, draft: false },
    ]);
    setupMock();
    mockOctokit.request.mockRejectedValueOnce({ status: 404 });
    mockOctokit.request.mockResolvedValueOnce({ data: { id: 456 } });
    const result = await _generateReleaseNotes(
      mockOctokit as any,
      "owner",
      "repo",
      "confluenceSpace",
      "main",
      "develop",
    );
    expect(result).toBe(456);
    expect(mockOctokit.request).toHaveBeenNthCalledWith(
      3,
      "GET /repos/{owner}/{repo}/releases/tags/{tag}",
      expect.objectContaining({ tag: "v1.1.0" }),
    );
    expect(mockOctokit.request).toHaveBeenNthCalledWith(
      4,
      "POST /repos/{owner}/{repo}/releases",
      expect.objectContaining({
        tag_name: "v1.1.0",
        name: "v1.1.0",
        body: "Jira Tickets:\n- https://confluenceSpace.atlassian.net/browse/OVP-1234\n- https://confluenceSpace.atlassian.net/browse/OVP-5678\n- https://confluenceSpace.atlassian.net/browse/OVP-9012",
        draft: true,
      }),
    );
  });
});
