import * as core from "@actions/core";
import { GitHub } from "@actions/github/lib/utils";
import { exec } from "child_process";
import { Octokit } from "../create-release-notes";

/**
 *
 * @param version - The version string to extract parts from.
 * @returns An array of version parts, where numeric parts are converted to numbers and non-numeric parts remain as strings.
 */
export function extractVersionParts(version: string): (string | number)[] {
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
      return partA === 0 ? -1 : 1;
    }

    // Otherwise, compare as strings
    return String(partA).localeCompare(String(partB));
  }

  return 0;
}

export async function getReleaseBranches(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string[]> {
  const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
    per_page: 100,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  // Find branches that match the pattern "releases/v*.*.*" or "origin/releases/v*.*.* "
  const releaseBranches = branches.filter((branch: { name: string }) =>
    /^(\w+\/)?releases\/v\d+(\.\d+){0,2}$/.test(branch.name),
  );

  if (releaseBranches.length === 0) {
    core.setFailed(
      "No release branches found matching pattern 'releases/v*.*.*'",
    );
    return [];
  }
  // Sort the release branches by version number and get the latest one
  const releaseBranchNames = releaseBranches.map(
    (branch: { name: string }) => branch.name,
  );
  console.log("Found release branches:", releaseBranchNames);
  releaseBranchNames.sort(sortReleaseVersions);
  return releaseBranchNames;
}
/**
 * Gets the latest release tag by looking for branches that match the pattern "releases/v*.*.*"
 * and returning the one with the highest version number
 */
export async function getLatestReleaseTag(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
): Promise<string> {
  console.log(
    `Fetching branches for ${owner}/${repo} to find latest release tag...`,
  );
  const releaseBranchNames = await getReleaseBranches(octokit, owner, repo);
  if (releaseBranchNames.length === 0) {
    core.setFailed(
      "No release branches found matching pattern 'releases/v*.*.*'",
    );
    return "";
  }
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
      `Branch name "${branchName}" does not match expected release branch pattern (e.g. releases/v1.2.3 or origin/releases/v1.2.3)`,
    );
  }
  return match[1];
}

export async function getTag(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
  branchName: string,
  pattern: RegExp = /^(?:.*\/)?releases?\/(?:origin\/)?(v\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?)$/,
): Promise<string> {
  console.log(`Extracting tag from branch name: ${branchName}`);
  if (branchName.replace(/^origin\//, "") === "develop") {
    const latestReleaseTag = await getLatestReleaseTag(octokit, owner, repo);
    const versionParts = extractVersionParts(latestReleaseTag);
    const major = versionParts[0] || 0;
    const minor = versionParts[1] || 0;
    if (typeof major !== "number" || typeof minor !== "number") {
      throw new Error(
        `Latest release tag "${latestReleaseTag}" does not have a valid version format (e.g. v1.2.3)`,
      );
    }
    const nextMinorVersion = `v${major}.${minor + 1}.0`;
    console.log(
      `Branch is develop, using next minor version tag: ${nextMinorVersion}`,
    );
    return nextMinorVersion;
  }
  return getTagFromBranchName(branchName, pattern);
}

/**
 * gets the latest prerelease release for a given repository.
 * @param octokit
 * @param owner
 * @param repo
 * @returns Returns the release id if found or -1 if no prerelease releases found.
 */
export async function getLatestPreRelease(
  octokit: InstanceType<typeof GitHub>,
  owner: string,
  repo: string,
): Promise<any | undefined> {
  console.log(
    `Fetching releases for ${owner}/${repo} to find latest prerelease releases...`,
  );
  const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner,
    repo,
    per_page: 100,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!releases) {
    console.log("No releases found for repository.");
    return;
  }
  const prereleaseReleases = releases.filter(
    (release: { prerelease: boolean }) => release.prerelease,
  );
  if (prereleaseReleases.length === 0) {
    console.log("No prerelease releases found for repository.");
    return;
  }
  // sort prerelease releases by version number and return the id of the oldest one
  const sortedPreReleases = prereleaseReleases.sort(
    (a: { tag_name: string }, b: { tag_name: string }) =>
      sortReleaseVersions(a.tag_name, b.tag_name),
  );
  console.log(
    "Found prerelease releases:",
    sortedPreReleases.map((r: { tag_name: string }) => r.tag_name),
  );
  return sortedPreReleases[0];
}

/**
 * Lists all branches in the current git repository by executing "git branch -a" command.
 * @returns A promise that resolves to an array of branch names.
 * @throws An error if the git command fails or returns an error output.
 */
export function listBranches(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec(
      "git branch -a",
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          return reject(new Error(`Error listing branches: ${error.message}`));
        }
        if (stderr) {
          return reject(new Error(`Error output: ${stderr}`));
        }
        const branches = stdout
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean);
        console.debug("Branches:", branches);
        resolve(branches);
      },
    );
  });
}

/**
 * Checks if a release with the given tag already exists in the repository.
 * @param tag - The release tag to check for existence (e.g. "v1.2.3").
 * @returns Returns the release id if found or false if no release with the given tag exists.
 */
export async function releaseExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
): Promise<{ id: number , prerelease: boolean } | undefined> {
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/releases/tags/{tag}",
      {
        owner,
        repo,
        tag,
        headers: {
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );
    console.log(
      `Release with tag ${tag} already exists with id ${response.id}`,
    );
    return { id: response.id, prerelease: response.prerelease };
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Release with tag ${tag} does not exist.`);
      return undefined;
    }
    throw error;
  }
}

/**
 * Creates a release in the specified repository with the given tag, target branch, and release notes content. If a release with the same tag already exists, it will be updated instead.
 * @param tag - The release tag to create (e.g. "v1.2.3").
 * @param releaseBranch - The target branch for the release (e.g. "releases/v1.2.3").
 * @param body - The release notes content to include in the release description.
 * @param prerelease - Whether to create the release as a prerelease (default: true). If false, the release will be published immediately.
 * @returns The ID of the created release.
 */
export async function createRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  releaseBranch: string,
  body: string,
  prerelease: boolean = true,
) {
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/releases",
    {
      owner,
      repo,
      tag_name: tag,
      target_commitish: releaseBranch.replace("origin/", ""),
      name: tag,
      body: body,
      prerelease: prerelease,
      generate_release_notes: false,
      headers: {
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  return response.data.id;
}

/**
 * Updates an existing release in the specified repository with the given tag, target branch, and release notes content. The release to update is identified by the provided release ID.
 * @param releaseId - The ID of the release to update.
 * @param tag - The release tag to update (e.g. "v1.2.3").
 * @param releaseBranch - The target branch for the release (e.g. "releases/v1.2.3").
 * @param body - The release notes content to include in the release description.
 * @param prerelease - Whether to keep the release as a prerelease (default: true). If false, the release will be published immediately.
 */
export async function updateRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseId: number,
  tag: string,
  releaseBranch: string,
  body: string,
  prerelease: boolean = true,
) {
  await octokit.request("PATCH /repos/{owner}/{repo}/releases/{release_id}", {
    owner: owner,
    repo: repo,
    release_id: releaseId,
    tag_name: tag,
    target_commitish: releaseBranch.replace("origin/", ""),
    name: tag,
    body: body,
    prerelease: prerelease,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
}

export async function createGithubRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseTag: string,
  releaseBranch: string,
  releaseNotesContent: string,
  prerelease: boolean = true,
): Promise<number> {
  console.log("Check if release already exists for tag:", releaseTag);
  const existingRelease = await releaseExists(octokit, owner, repo, releaseTag);
  if (existingRelease) {
    await updateRelease(
      octokit,
      owner,
      repo,
      existingRelease.id,
      releaseTag,
      releaseBranch,
      releaseNotesContent,
      prerelease,
    );
    console.log(
      `Updated existing release with tag ${releaseTag} and id ${existingRelease.id}`,
    );
    return existingRelease.id;
  } else {
    const releaseId = await createRelease(
      octokit,
      owner,
      repo,
      releaseTag,
      releaseBranch,
      releaseNotesContent,
      prerelease,
    );
    console.log(
      `Created new release with tag ${releaseTag} and id ${releaseId}`,
    );
    return releaseId;
  }
}

export async function publishPrerelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseId: number,
) {
  return octokit.request("PATCH /repos/{owner}/{repo}/releases/{release_id}", {
    owner: owner,
    repo: repo,
    release_id: releaseId,
    prerelease: false,
    make_latest: "true",
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
}

export async function publishLatestRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<number | undefined> {
  console.log("Publishing latest release...");
  const firstPrerelease = await getLatestPreRelease(octokit, owner, repo);
  if (firstPrerelease) {
    console.log(
      `Latest release ${firstPrerelease.name} with id ${firstPrerelease.id} already exists. Updating it to publish...`,
    );
    await publishPrerelease(octokit, owner, repo, firstPrerelease.id);
    console.log(`Published latest release with id ${firstPrerelease.id}`);
    return firstPrerelease.id;
  }
  return;
}
