import * as core from "@actions/core";
import * as github from "@actions/github";
import { exec } from "node:child_process";
import { getLatestDraftRelease, getTagFromBranchName } from "./libs/git-utils";

type Octokit = ReturnType<typeof github.getOctokit>;

function listBranches(): Promise<string[]> {
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

function getCommitMessages(
  baseBranch: string,
  releaseBranch: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec(
      `git log ${baseBranch}..${releaseBranch} --pretty=format:"%s"`,
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          return reject(
            new Error(`Error fetching commit messages: ${error.message}`),
          );
        }
        if (stderr) {
          return reject(new Error(`Error output: ${stderr}`));
        }
        const commitMessages = stdout
          .split("\n")
          .map((m) => m.trim())
          .filter(Boolean);

        resolve(commitMessages);
      },
    );
  });
}

function filterJiraTickets(commitMessages: string[]) {
  const jiraTicketPattern = /OVP-\d+/g;
  const tickets = new Set<string>();
  commitMessages.forEach((message) => {
    const matches = message.match(jiraTicketPattern);
    if (matches) {
      matches.forEach((ticket) => tickets.add(ticket));
    }
  });
  return Array.from(tickets);
}

function generateJiraLinks(confluenceSpace: string, tickets: string[]) {
  return tickets.map(
    (ticket) => `https://${confluenceSpace}.atlassian.net/browse/${ticket}`,
  );
}

async function releaseExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
): Promise<number | false> {
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
    console.log(`Release with tag ${tag} already exists with id ${response.data.id}`);
    return response.data.id;
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Release with tag ${tag} does not exist. Will create a new one.`);
      return false;
    }
    throw error;
  }
}

async function createRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  releaseBranch: string,
  body: string,
  draft: boolean = true
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
      draft: draft,
      prerelease: false,
      generate_release_notes: false,
      headers: {
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  return response.data.id;
}

async function updateRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseId: number,
  tag: string,
  releaseBranch: string,
  body: string,
  draft: boolean = true,
) {
  await octokit.request("PATCH /repos/{owner}/{repo}/releases/{release_id}", {
    owner: owner,
    repo: repo,
    release_id: releaseId,
    tag_name: tag,
    target_commitish: releaseBranch.replace("origin/", ""),
    name: tag,
    body: body,
    draft: draft,
    prerelease: false,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
}

function generateReleaseNotesContent(links: string[]) {
  if (links.length === 0) {
    return "No Jira tickets found for this release.";
  }
  return `Jira Tickets:\n${links.map((link) => `- ${link}`).join("\n")}`;
}

async function createGithubRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseTag: string,
  releaseBranch: string,
  releaseNotesContent: string,
  draft: boolean = true,
): Promise<number> {
  const releaseExistsId = await releaseExists(octokit, owner, repo, releaseTag);
  if (releaseExistsId) {
    await updateRelease(
      octokit,
      owner,
      repo,
      releaseExistsId,
      releaseTag,
      releaseBranch,
      releaseNotesContent,
      draft,
    );
    console.log(
      `Updated existing release with tag ${releaseTag} and id ${releaseExistsId}`,
    );
    return releaseExistsId;
  } else {
    const releaseId = await createRelease(
      octokit,
      owner,
      repo,
      releaseTag,
      releaseBranch,
      releaseNotesContent,
      draft,
    );
    console.log(
      `Created new release with tag ${releaseTag} and id ${releaseId}`,
    );
    return releaseId;
  }
}

function publishDraftRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseId: number,
) {
  return octokit.request("PATCH /repos/{owner}/{repo}/releases/{release_id}", {
    owner: owner,
    repo: repo,
    release_id: releaseId,
    draft: false,
    headers: {
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
}

async function publishLatestRelease(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<number | undefined> {
  console.log("Publishing latest release...");
  const releaseExistsId = await getLatestDraftRelease(
    octokit,
    owner,
    repo,
  );
  if (releaseExistsId) {
    console.log(
      `Latest release with id ${releaseExistsId} already exists. Updating it to publish...`,
    );
    await publishDraftRelease(octokit, owner, repo, releaseExistsId);
    console.log(`Published latest release with id ${releaseExistsId}`);
    return releaseExistsId;
  }
  return;
}

async function generateReleaseNotes(
  octokit: Octokit,
  owner: string,
  repo: string,
  confluenceSpace: string,
  baseBranch: string,
  releaseBranch: string,
  createReleaseTag: boolean = true,
): Promise<number | undefined> {
  console.debug(
    `generateReleaseNotes called with baseBranch=${baseBranch}, releaseBranch=${releaseBranch}, createReleaseTag=${createReleaseTag}`,
  );
  // If branch base branch and release branch are the same, publish latest release
  if (baseBranch.replace(/^origin\//, "") === releaseBranch.replace(/^origin\//, "")) {
    const result = await publishLatestRelease(octokit, owner, repo);
    if (result) {
      return result;
    }
  }
  const releaseTag = getTagFromBranchName(releaseBranch);
  listBranches();
  const commitMessages = await getCommitMessages(baseBranch, releaseBranch);
  const tickets = filterJiraTickets(commitMessages);
  if (tickets.length === 0) {
    core.info("No commits found between base branch and release branch.");
    return;
  }
  console.log("Jira Tickets:", tickets);
  const links = generateJiraLinks(confluenceSpace, tickets);
  console.log("Jira Links:", links);
  const releaseNotesContent = generateReleaseNotesContent(links);
  console.log("Release Notes Content:", releaseNotesContent);
  if (createReleaseTag === true) {
    console.log(`Creating/updating GitHub release for tag ${releaseTag}...`);
    return await createGithubRelease(
      octokit,
      owner,
      repo,
      releaseTag,
      releaseBranch,
      releaseNotesContent,
    );
  } else {
    console.log(
      `Skipping GitHub release creation for tag ${releaseTag} since createReleaseTag is false. Outputting release notes content instead...`,
    );
    core.summary
      .addHeading(`Release notes for tag ${releaseTag}`)
      .addList(links);
    core.summary.write({ overwrite: true });
    return;
  }
}

export async function run() {
  const octokit = github.getOctokit(core.getInput("github-token"));
  const baseBranch = `origin/${core.getInput("base-branch").replace(/^origin\//, "")}`;
  const releaseBranch = `origin/${core.getInput("release-branch").replace(/^origin\//, "")}`;
  const confluenceSpace = core.getInput("confluence-space");
  const createGithubReleaseFlag =
    core.getInput("generate-github-release").toLowerCase() === "true";
  const { owner, repo } = github.context.repo;
  const releaseId = await generateReleaseNotes(
    octokit,
    owner,
    repo,
    confluenceSpace,
    baseBranch,
    releaseBranch,
    createGithubReleaseFlag,
  );
  core.setOutput("release-id", releaseId ?? "");
}

export {
  getCommitMessages as _getCommitMessages,
  filterJiraTickets as _filterJiraTickets,
  generateJiraLinks as _generateJiraLinks,
  releaseExists as _releaseExists,
  createRelease as _createRelease,
  listBranches as _listBranches,
  createGithubRelease as _createGithubRelease,
  Octokit as _Octokit,
  generateReleaseNotesContent as _generateReleaseNotesContent,
  generateReleaseNotes as _generateReleaseNotes,
};
