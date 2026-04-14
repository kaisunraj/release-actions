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
    console.log(
      `Found PR #${pr.number}: ${pr.html_url} (head: ${pr.head.ref}, base: ${pr.base.ref})`,
    );
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

async function checkMergeConflicts(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  baseBranch: string,
  targetBranch: string,
): Promise<boolean> {
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/compare/{base}...{head}",
    {
      owner,
      repo,
      base: baseBranch,
      head: targetBranch,
      headers: {
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  if (response.data.status === "diverged") {
    console.log(
      `Branches '${baseBranch}' and '${targetBranch}' have diverged. Merge conflicts detected.`,
    );
    return true;
  }
  console.log(
    `Branches '${baseBranch}' and '${targetBranch}' do not have merge conflicts.`,
  );
  return false;
}

async function getBranchHeadSha(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/branches/{branch}",
    {
      owner,
      repo,
      branch,
      headers: {
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  return response.data.commit.sha;
}

async function createConflictResolutionBranch(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  baseBranch: string,
  targetBranch: string,
  releaseBranch: string,
): Promise<string> {
  const releaseTag = getTagFromBranchName(releaseBranch);
  const conflictBranchName = `feature/OVP-0000-conflict-resolution-${targetBranch}-into-${baseBranch}-for-${releaseTag}`;
  console.log(
    `Creating conflict resolution branch '${conflictBranchName}' from '${targetBranch}'...`,
  );
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${conflictBranchName}`,
    sha: await getBranchHeadSha(octokit, owner, repo, targetBranch),
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  return conflictBranchName;
}

/**
 * Main function to run the action
 */
async function run(): Promise<void> {
  const token = core.getInput("github-token", { required: true });
  const baseBranch = core.getInput("base-branch", { required: true });
  let targetBranch = core.getInput("target-branch", { required: true });

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  // 1. Get the latest release tag
  const releaseBranch = await getLatestReleaseTag(octokit, owner, repo, true);
  if (!releaseBranch) {
    return;
  }
  const releaseTag = getTagFromBranchName(releaseBranch);

  const hasMergeConflicts = await checkMergeConflicts(
    octokit,
    owner,
    repo,
    baseBranch,
    targetBranch,
  );
  if (hasMergeConflicts) {
    const conflictBranchName = await createConflictResolutionBranch(
      octokit,
      owner,
      repo,
      baseBranch,
      targetBranch,
      releaseBranch,
    );
    core.notice(
      `Merge conflicts detected between '${baseBranch}' and '${targetBranch}'. Created conflict resolution branch '${conflictBranchName}''.`,
    );
    targetBranch = conflictBranchName;
  }

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
  getBranchHeadSha as _getBranchHeadSha,
  createConflictResolutionBranch as _createConflictResolutionBranch,
  checkMergeConflicts as _checkMergeConflicts,
  checkExistingPr as _checkExistingPr,
  createPullRequest as _createPullRequest,
};
