import * as core from "@actions/core";
import { GitHub } from "@actions/github/lib/utils";

/**
 *
 * @param version - The version string to extract parts from.
 * @returns An array of version parts, where numeric parts are converted to numbers and non-numeric parts remain as strings.
 */
function extractVersionParts(version: string): (string | number)[] {
  return version
    .replace(/^(releases\/)?v/, "")
    .split(/[\.-]/)
    .map((part) => (isNaN(Number(part)) ? part : Number(part)));
}

/**
 * Compares two version strings and returns a number indicating their relative order.
 * @param a - The first version string.
 * @param b - The second version string.
 * @returns A negative number if a < b, a positive number if a > b, or 0 if they are equal.
 */
export function sortReleaseVersions(a: string, b: string): number {
  const partsA = extractVersionParts(a);
  const partsB = extractVersionParts(b);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    
    if (partA === partB) continue;

    // If both parts are numbers, compare numerically
    if (typeof partA === "number" && typeof partB === "number") {
      return partA - partB;
    }

    if (partA === 0 || partB === 0) {
      // If one version has fewer parts, that version is considered older (e.g. v1.2 < v1.2.0)
      return partA === 0 ? - 1 : 1;
    }


    // Otherwise, compare as strings
    return String(partA).localeCompare(String(partB));
  }

  return 0;
}

/**
 * Gets the latest release tag by looking for branches that match the pattern "releases/v*.*.*"
 * and returning the one with the highest version number
 */
export async function getLatestReleaseTag(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
): Promise<string | undefined> {
  console.log(
    `Fetching branches for ${owner}/${repo} to find latest release tag...`,
  );
  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  console.debug("Branches response:", branches);
  // Find branches that match the pattern "releases/v*.*.*" or "origin/releases/v*.*.* "
  const releaseBranches = branches.filter((branch: { name: string }) =>
    /^(\w+\/)?releases\/v\d+(\.\d+){0,2}$/.test(branch.name),
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
  console.log("Found release branches:", releaseBranchNames);
  releaseBranchNames.sort(sortReleaseVersions);

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
  console.log(`Extracting tag from branch name: ${branchName}`);
  if (branchName.replace(/^origin\//, "") === "develop") {
    return "develop";
  }
  const match = branchName.match(pattern);
  if (!match) {
    throw new Error(
      `Branch name "${branchName}" does not match expected release branch pattern (e.g. releases/v1.2.3 or origin/releases/v1.2.3)`,
    );
  }
  return match[1];
}
