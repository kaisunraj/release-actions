const core = require("@actions/core");

/**
 * Gets the latest release tag by looking for branches that match the pattern "releases/v*.*.*"
 * and returning the one with the highest version number
 */

async function getLatestReleaseTag(octokit, owner, repo) {
  let releaseTag;
  const branches = await octokit.request("GET /repos/{owner}/{repo}/branches", {
    headers: {
      OWNER: owner,
      REPO: repo,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  // Find branches the match the pattern "releases/v*.*.*"
  const releaseBranches = branches.data.filter((branch) =>
    /^releases\/v\d+\.\d+\.\d+$/.test(branch.name),
  );
  if (releaseBranches.length === 0) {
    core.setFailed(
      "No release branches found matching pattern 'releases/v*.*.*'",
    );
    return;
  }
  // Sort the release branches by version number and get the latest one
  let releaseBrancheNames = releaseBranches.map((branch) => branch.name);
  releaseBrancheNames.sort();
  releaseTag = releaseBrancheNames[releaseBrancheNames.length - 1];
  core.info(`Latest release tag: ${releaseTag}`);
  return releaseTag;
}

/**
 * Extracts the version tag from a branch name like "releases/v1.2.3"
 * Returns null if the branch name doesn't match the expected pattern
 */
function getTagFromBranchName(branchName) {
  const match = branchName.match(/^releases\/(v\d+\.\d+\.\d+)$/);
  return match ? match[1] : null;
}

module.exports = {
  getLatestReleaseTag,
  getTagFromBranchName,
};
