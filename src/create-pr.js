const core = require("@actions/core");
const github = require("@actions/github");
const {
  getLatestReleaseTag,
  getTagFromBranchName,
} = require("./libs/git-utils");

/**
 * Checks if there's an existing open PR from targetBranch into baseBranch
 * If there is, it fails the action with an error message containing the PR URL
 */
async function checkExistingPr(octokit, owner, repo, targetBranch, baseBranch) {
  // 2. Check for an existing open PR from target into base
  const { data: existingPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${targetBranch}`,
    base: baseBranch,
  });

  if (existingPRs.length > 0) {
    const existing = existingPRs[0];
    core.setFailed(
      `An open PR from '${targetBranch}' into '${baseBranch}' already exists: ${existing.html_url}`,
    );
    return;
  }
}

/**
 * Creates a pull request and returns the PR URL
 */
async function createPullRequest(
  octokit,
  prTitle,
  baseBranch,
  targetBranch,
  owner,
  repo,
) {
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    head: targetBranch,
    base: baseBranch,
    title: prTitle,
  });
  return pr.html_url;
}

/**
 * Main function to run the action
 */
async function run() {
  const token = core.getInput("github-token", { required: true });
  const baseBranch = core.getInput("base-branch", { required: true });
  const targetBranch = core.getInput("target-branch", { required: true });

  const octokit = new github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  // 1. Get the latest release tag
  const releaseBranch = await getLatestReleaseTag(octokit, owner, repo);
  const releaseTag = getTagFromBranchName(releaseBranch);

  // 2. Check for an existing open PR from target into base
  await checkExistingPr(octokit, owner, repo, targetBranch, baseBranch);

  // 3. Create the pull request
  const prTitle = `Main into Develop for Release ${releaseTag}`;

  const prUrl = await createPullRequest(
    octokit,
    prTitle,
    baseBranch,
    targetBranch,
    owner,
    repo,
  );

  core.info(`Pull request created: ${prUrl}`);
  core.setOutput("pull-request-url", prUrl);
}

module.exports = {
  run,
  _checkExistingPr: checkExistingPr,
  _createPullRequest: createPullRequest,
};
