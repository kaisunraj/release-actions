import { getTagFromBranchName } from "./libs/git-utils";

import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";

const { exec } = require("child_process");

function getCommitMessages(baseBranch: string, targetBranch: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec(
      `git log ${baseBranch}..${targetBranch} --pretty=format:"%s"`,
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          return reject(new Error(`Error fetching commit messages: ${error.message}`));
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


async function releaseExists(octokit: InstanceType<typeof GitHub>, tag: string) {
  try {
    await octokit.request('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
      owner: core.getInput("GITHUB_REPOSITORY_OWNER"),
      repo: core.getInput("GITHUB_REPOSITORY_NAME"),
      tag: tag,
      headers: {
        'X-GitHub-Api-Version': '2026-03-10'
      }
    });
    return true; // Release exists
  } catch (error: any) {
    if (error.status === 404) {
      return false; // Release does not exist
    }
    throw error; // Rethrow other errors
  }
}

async function createRelease(octokit: InstanceType<typeof GitHub>, tag: string) {
  await octokit.request('POST /repos/{owner}/{repo}/releases', {
    owner: core.getInput("GITHUB_REPOSITORY_OWNER"),
    repo: core.getInput("GITHUB_REPOSITORY_NAME"),
    tag_name: tag,
    target_commitish: 'master',
    name: tag,
    body: 'Description of the release',
    draft: false,
    prerelease: false,
    generate_release_notes: false,
    headers: {
      'X-GitHub-Api-Version': '2026-03-10'
    }
  })
}

async function updateRelease(octokit: InstanceType<typeof GitHub>, tag: string, baseBranch: string) {
  await octokit.request('PATCH /repos/{owner}/{repo}/releases/{release_id}', {
    owner: core.getInput("GITHUB_REPOSITORY_OWNER"),
    repo: core.getInput("GITHUB_REPOSITORY_NAME"),
    release_id: tag,
    tag_name: tag,
    target_commitish: baseBranch,
    name: tag,
    body: 'Description of the release',
    draft: false,
    prerelease: false,
    headers: {
      'X-GitHub-Api-Version': '2026-03-10'
    }
  })
}
  

async function generateReleaseNotes(baseBranch: string, targetBranch: string) {
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
}

function run() {
  const octokit = github.getOctokit(core.getInput("GITHUB_TOKEN"));
  const baseBranch = core.getInput("base_branch");
  const targetBranch = core.getInput("target_branch");
  
  generateReleaseNotes(baseBranch, targetBranch)
    .then(() => {
      console.log("Release notes generated successfully.");
    })
    .catch((error) => {
      core.setFailed(error.message);
    });
}
