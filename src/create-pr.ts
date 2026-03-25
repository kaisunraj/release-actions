import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import { getLatestReleaseTag, getTagFromBranchName } from "./libs/git-utils";

/**
 * Checks if there's an existing open PR from targetBranch into baseBranch
 * If there is, it fails the action with an error message containing the PR URL
 */
async function checkExistingPr(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  targetBranch: string,
  baseBranch: string,
): Promise<void> {
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
  }
}

/**
 * Creates a pull request and returns the PR URL
 */
async function createPullRequest(
  octokit: InstanceType<typeof GitHub>,
  prTitle: string,
  baseBranch: string,
  targetBranch: string,
  owner: string,
  repo: string,
): Promise<string> {
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
async function run(): Promise<void> {
  const token = core.getInput("github-token", { required: true });
  const baseBranch = core.getInput("base-branch", { required: true });
  const targetBranch = core.getInput("target-branch", { required: true });

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  // 1. Get the latest release tag
  const releaseBranch = await getLatestReleaseTag(octokit, owner, repo);
  if (!releaseBranch) {
    return;
  }
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

export {
  run,
  checkExistingPr as _checkExistingPr,
  createPullRequest as _createPullRequest,
};
