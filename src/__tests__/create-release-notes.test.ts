import { _generateReleaseNotesContent } from "../create-release-notes";

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

