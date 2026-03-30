const mockPulls = {
  list: jest.fn().mockResolvedValue({ data: [] }),
  create: jest.fn().mockResolvedValue({
    data: { html_url: "https://github.com/owner/repo/pull/2" },
  }),
};

const mockOctokit = {
  request: jest.fn().mockResolvedValue({
    data: [
      { name: "releases/v1.0.0" },
      { name: "releases/v1.2.0" },
      { name: "releases/v1.2.1" },
      { name: "releases/v1.1.0" },
      { name: "releases/v1.1.1" },
      { name: "main" },
      { name: "develop" },
    ],
  }),
  rest: { pulls: mockPulls },
};

module.exports = {
  getOctokit: jest.fn(() => mockOctokit),
  context: { repo: { owner: process.env.GITHUB_REPOSITORY_OWNER || "owner", repo: process.env.GITHUB_REPOSITORY_NAME || "repo" } },
  // Expose rest at the top level so tests can assert on it directly
  rest: { pulls: mockPulls },
};
