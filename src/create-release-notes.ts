import * as core from "@actions/core";
import * as github from "@actions/github";
import { exec } from "node:child_process";
import { getTagFromBranchName } from "./libs/git-utils";

type Octokit = ReturnType<typeof github.getOctokit>;

function getCommitMessages(
  baseBranch: string,
  targetBranch: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec(
      `git log ${baseBranch}..${targetBranch} --pretty=format:"%s"`,
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

function generateJiraLinks(tickets: string[]) {
  return tickets.map(
    (ticket) => `https://tecsagroup.atlassian.net/browse/${ticket}`,
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
    return response.data.id;
  } catch (error: any) {
    if (error.status === 404) {
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
  targetBranch: string,
) {
  const response = await octokit.request(
    "POST /repos/{owner}/{repo}/releases",
    {
      owner,
      repo,
      tag_name: tag,
      target_commitish: targetBranch,
      name: tag,
      body: "Description of the release",
      draft: false,
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
  releaseId: number,
  tag: string,
  baseBranch: string,
) {
  await octokit.request("PATCH /repos/{owner}/{repo}/releases/{release_id}", {
    owner: core.getInput("GITHUB_REPOSITORY_OWNER"),
    repo: core.getInput("GITHUB_REPOSITORY_NAME"),
    release_id: releaseId,
    tag_name: tag,
    target_commitish: baseBranch,
    name: tag,
    body: "Description of the release",
    draft: false,
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

async function generateReleaseNotes(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseBranch: string,
  targetBranch: string,
) {
  const releaseTag = getTagFromBranchName(targetBranch);
  if (!releaseTag) {
    throw new Error(
      `Branch name "${targetBranch}" does not match expected release branch pattern "releases/v*.*.*"`,
    );
  }
  const commitMessages = await getCommitMessages(baseBranch, targetBranch);
  const tickets = filterJiraTickets(commitMessages);
  console.log("Jira Tickets:", tickets);
  const links = generateJiraLinks(tickets);
  console.log("Jira Links:", links);
  const releaseNotesContent = generateReleaseNotesContent(links);
  console.log("Release Notes Content:", releaseNotesContent);
  const releaseExistsId = await releaseExists(octokit, owner, repo, releaseTag);
  if (releaseExistsId) {
    await updateRelease(octokit, releaseExistsId, releaseTag, baseBranch);
    console.log(`Updated existing release with tag ${releaseTag}`);
  } else {
    await createRelease(octokit, owner, repo, releaseTag, targetBranch);
    console.log(`Created new release with tag ${releaseTag}`);
  }
}

export async function run() {
  // const octokit = github.getOctokit(core.getInput("github-token"));
  // const baseBranch = core.getInput("base-branch");
  // const targetBranch = core.getInput("target-branch");
  // const { owner, repo } = github.context.repo;
  // await generateReleaseNotes(octokit, owner, repo, baseBranch, targetBranch);
}

export { 
  getCommitMessages as _getCommitMessages,
  generateReleaseNotesContent as _generateReleaseNotesContent 
};

run();
