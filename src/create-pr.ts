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
): Promise<string | void> {
  console.log(
    `Checking for existing open PRs from '${targetBranch}' into '${baseBranch}'...`,
  );
  const { data: existingPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "created",
    base: baseBranch,
  });

  for (const pr of existingPRs) {
    console.log(`Found PR #${pr.number}: ${pr.html_url} (head: ${pr.head.ref}, base: ${pr.base.ref})`);
    const isOpen = pr.state === "open";
    const baseMatches = pr.base.ref === baseBranch;
    const headMatches = pr.head.ref === targetBranch;
    if (isOpen && baseMatches && headMatches) {
      console.log(`Existing PR found: ${pr.html_url}`);
      return pr.html_url;
    }
  }
  return;
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
): Promise<{ prNumber: number; html_url: string }> {
  console.log(
    `Creating pull request from '${targetBranch}' into '${baseBranch}' with title '${prTitle}'...`,
  );
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    head: targetBranch,
    base: baseBranch,
    title: prTitle,
  });
  return { prNumber: pr.number, html_url: pr.html_url };
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
  const existingPrUrl = await checkExistingPr(
    octokit,
    owner,
    repo,
    targetBranch,
    baseBranch,
  );
  if (existingPrUrl) {
    core.notice(`Existing pull request found: ${existingPrUrl}`);
    return;
  }

  // 3. Create the pull request
  const prTitle = `Main into Develop for Release ${releaseTag}`;

  const { prNumber, html_url } = await createPullRequest(
    octokit,
    prTitle,
    baseBranch,
    targetBranch,
    owner,
    repo,
  );

  core.notice(`Pull request #${prNumber} created: ${html_url}`);
  core.setOutput("pull-request-url", html_url);
  core.setOutput("pull-request-number", prNumber);
}

export {
  run,
  checkExistingPr as _checkExistingPr,
  createPullRequest as _createPullRequest,
};
