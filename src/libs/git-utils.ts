import * as core from "@actions/core";
import { GitHub } from "@actions/github/lib/utils";

/**
 * Gets the latest release tag by looking for branches that match the pattern "releases/v*.*.*"
 * and returning the one with the highest version number
 */
export async function getLatestReleaseTag(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
): Promise<string | undefined> {
  const branches = await octokit.request("GET /repos/{owner}/{repo}/branches", {
    owner,
    repo,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });

  // Find branches that match the pattern "releases/v*.*.*"
  const releaseBranches = branches.data.filter((branch: { name: string }) =>
    /^releases\/v\d+\.\d+\.\d+$/.test(branch.name),
  );

  if (releaseBranches.length === 0) {
    core.setFailed(
      "No release branches found matching pattern 'releases/v*.*.*'",
    );
    return undefined;
  }

  // Sort the release branches by version number and get the latest one
  const releaseBranchNames = releaseBranches.map(
    (branch: { name: string }) => branch.name,
  );
  releaseBranchNames.sort();

  const releaseTag = releaseBranchNames[releaseBranchNames.length - 1];
  core.info(`Latest release tag: ${releaseTag}`);
  return releaseTag;
}

/**
 * Extracts the version tag from a branch name.
 * Supports formats:
 *   - releases/v1.2.3
 *   - origin/release/v1.2.3
 *   - release/v1.2.3
 */
export function getTagFromBranchName(
  branchName: string,
  pattern: RegExp = /^(?:.*\/)?releases?\/(?:origin\/)?(v\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?)$/,
): string {
  const match = branchName.match(pattern);
  if (!match) {
    throw new Error(
      `Branch name "${branchName}" does not match expected release branch pattern (e.g. releases/v1.2.3 or origin/release/v1.2.3)`,
    );
  }
  return match[1];
}
