import * as dotenv from "dotenv";
dotenv.config();
import { exec } from "node:child_process";
import { run } from "../create-release-notes";

jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../libs/git-utils");

function createBranch(branchName: string) {
    exec(`git checkout -b ${branchName}`);
}

function commitFiles(jiraTicket: string) {
  // Create dummy text file
  exec(`echo "dummy content" > dummy_${jiraTicket}.txt`);
  exec(`git add dummy_${jiraTicket}.txt`);
  exec(`git commit -m "${jiraTicket}: Add dummy file"`);
}

test("Integration test for create-release-notes", async () => {
  const jiraTickets = ["OVP-123", "OVP-456", "OVP-789"];
  createBranch("releases/v1.1.0");
  jiraTickets.forEach((ticket) => {
    commitFiles(ticket);
  });
  await run();
  // delete the branch after test
  exec(`git checkout main && git branch -D releases/v1.1.0`);
});
