import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  createGithubRelease,
  getTagFromBranchName,
  listBranches,
  publishLatestRelease,
} from "./libs/git-utils";

export type Octokit = ReturnType<typeof github.getOctokit>;

function filterJiraTickets(commitMessages: string[]) {
  const jiraTicketPattern = /OVP-\d+/g;
  const tickets = new Set<string>();
  commitMessages.forEach((message) => {
    const matches = message.match(jiraTicketPattern);
    if (matches) {
      for (const ticket of matches) {
        const ticketNos = ticket.match(/\d+/);
        ticketNos
          ?.filter((ticketNo) => parseInt(ticketNo) !== 0)
          .forEach((ticketNo) => {
            tickets.add(ticket);
          });
      }
    }
  });
  return Array.from(tickets);
}

async function getMergedBranchNames(
  octokit: Octokit,
  owner: string,
  repo: string,
  commits: { commit: { message: string } }[],
): Promise<string[]> {
  const prNumbers = new Set<number>();
  for (const commit of commits) {
    const message = commit.commit.message;
    const mergeMatch = message.match(/#\d+/);
    if (mergeMatch) {
      const prNo = Number(mergeMatch[0].slice(1));
      prNumbers.add(prNo);
    }
  }
  const mergedBranches = new Set<string>();
  for (const prNo of prNumbers) {
    try {
      const prResponse = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner,
          repo,
          pull_number: prNo,
          headers: {
            "X-GitHub-Api-Version": "2026-03-10",
          },
        },
      );
      const pr = prResponse.data;
      mergedBranches.add(pr.head.ref);
    } catch (error) {
      console.error(`Error fetching PR #${prNo}:`, error);
    }
  }
  return Array.from(mergedBranches);
}

function generateJiraLinks(confluenceSpace: string, tickets: string[]) {
  return tickets.map(
    (ticket) => `https://${confluenceSpace}.atlassian.net/browse/${ticket}`,
  );
}

function generateReleaseNotesContent(links: string[]) {
  if (links.length === 0) {
    return "No Jira tickets found for this release.";
  }
  return `Jira Tickets:\n${links.map((link) => `- ${link}`).join("\n")}`;
}

export async function getTicketsBetweenBranches(
  octokit: Octokit,
  owner: string,
  repo: string,
  releaseBranch: string,
  baseBranch: string = "develop",
): Promise<string[]> {
  // Remove origin/ prefix if present for comparison
  releaseBranch = releaseBranch.replace(/^origin\//, "");
  baseBranch = baseBranch.replace(/^origin\//, "");
  console.log(
    `Fetching tickets between branches ${baseBranch} and ${releaseBranch}...`,
  );
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/compare/{base}...{head}",
    {
      owner,
      repo,
      base: baseBranch,
      head: releaseBranch,
      headers: {
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  const commits = response.data.commits;
  console.log(
    `Found ${commits.length} commits between ${baseBranch} and ${releaseBranch}`,
  );
  const jiraTickets = filterJiraTickets(
    commits.map(
      (commit: { commit: { message: string } }) => commit.commit.message,
    ),
  );
  const mergedBranches = await getMergedBranchNames(
    octokit,
    owner,
    repo,
    commits,
  );
  const mergedBranchTickets = filterJiraTickets(mergedBranches);
  const allTickets = Array.from(
    new Set([...jiraTickets, ...mergedBranchTickets]),
  );
  console.log(
    `Extracted ${allTickets.length} unique Jira tickets:`,
    allTickets,
  );
  return allTickets;
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
  if (
    baseBranch.replace(/^origin\//, "") ===
    releaseBranch.replace(/^origin\//, "")
  ) {
    console.log(
      `Base branch and release branch are the same (${baseBranch}). Publishing latest release instead of generating new release notes...`,
    );
    const result = await publishLatestRelease(octokit, owner, repo);
    if (!result) {
      console.log("No releases found to publish.");
      return;
    } else {
      return result;
    }
  }
  const releaseTag = getTagFromBranchName(releaseBranch);
  const tickets = await getTicketsBetweenBranches(
    octokit,
    owner,
    repo,
    releaseBranch,
    baseBranch,
  );
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
  filterJiraTickets as _filterJiraTickets,
  getMergedBranchNames as _getMergedBranchNames,
  generateJiraLinks as _generateJiraLinks,
  getTicketsBetweenBranches as _getTicketsBetweenBranches,
  generateReleaseNotes as _generateReleaseNotes,
  generateReleaseNotesContent as _generateReleaseNotesContent,
};
