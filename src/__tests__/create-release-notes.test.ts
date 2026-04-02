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
} from "../create-release-notes";

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

describe("_generateReleaseNotes", () => {
  it("updates the existing release and returns its id", async () => {
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

  it("creates a new release and returns its id when none exists", async () => {
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

  it("resolves with undefined when no Jira tickets are found in commit messages", async () => {
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

  it("returns the latest draft release id and publishes it when base and release branches are the same", async () => {
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
    mockExec.mockImplementation((command, callback) => {
      callback(null, "OVP-1: one\nOVP-2: two\n", "");
    });
    await _generateReleaseNotes(
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
      "https://confluenceSpace.atlassian.net/browse/OVP-1",
      "https://confluenceSpace.atlassian.net/browse/OVP-2",
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
});
