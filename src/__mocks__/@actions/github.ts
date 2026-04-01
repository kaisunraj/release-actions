const github: any = {};

const mockPulls = {
  list: jest.fn().mockResolvedValue({ data: [] }),
  create: jest.fn().mockResolvedValue({
    data: { html_url: "https://github.com/owner/repo/pull/2" },
  }),
};

const repos = {
  listBranches: jest.fn().mockResolvedValue({
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
};

const context: any = { repo: { owner: "owner", repo: "repo" } };

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
  rest: { pulls: mockPulls, repos: repos },
  paginate: jest.fn(),
};

function __setMockValue(value: any) {
  mockOctokit.request.mockResolvedValue({ data: value });
}

function __setMockListBranches(value: any) {
  mockOctokit.rest.repos.listBranches.mockResolvedValue({ data: value });
}

function __setMockPaginate(value: any) {
  mockOctokit.paginate.mockResolvedValue(value);
}

function __setMockPullsList(value: any) {
  mockOctokit.rest.pulls.list.mockResolvedValue({ data: value });
}

github.getOctokit = jest.fn(() => mockOctokit);
github.context = context;
github.__setMockValue = __setMockValue;
github.__setMockListBranches = __setMockListBranches;
github.__setMockPaginate = __setMockPaginate;
github.__setMockPullsList = __setMockPullsList;

module.exports = github;
