import * as dotenv from "dotenv";
import * as fs from "fs";
import * as util from "util";
dotenv.config();
import { execSync } from "node:child_process";
import { _getCommitMessages, run } from "../create-release-notes";

jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../libs/git-utils");


async function createBranch(branchName: string) {
  execSync(`git checkout -b ${branchName}`);
}

function dummyCommit(jiraTicket: string) {
  execSync(`echo "Dummy commit for ${jiraTicket}" > dummy.txt`);
  execSync(`git add .`);
  execSync(`git commit -m "${jiraTicket}: Dummy commit message"`);
}

const baseBranch = "main";

beforeAll(() => {
  // Create dummy git repository for testing
  fs.mkdirSync("test-repo");
  process.chdir("test-repo");
  execSync("git init");
  execSync("git checkout -b main");
  execSync("echo 'Initial commit' > README.md");
  execSync("git add .");
  execSync('git commit -m "Initial commit"');
  // make sure we are in dummy repo for the tests
  expect(process.cwd()).toContain("test-repo");
  expect(fs.existsSync(".git")).toBe(true);
});

afterAll(() => {
  // Cleanup - delete the test repository
  process.chdir("..");
  fs.rmSync("test-repo", { recursive: true, force: true });
});

test("getCommitMessages returns commit messages between branches", async () => {
  const targetBranch = "feature-branch";
  createBranch(targetBranch);
  dummyCommit("OVP-123");
  dummyCommit("OVP-456");
  dummyCommit("OVP-789");
  
  const commitMessages = await _getCommitMessages(baseBranch, targetBranch);
  expect(commitMessages).toEqual([
    "OVP-789: Dummy commit message",
    "OVP-456: Dummy commit message",
    "OVP-123: Dummy commit message",
  ]);
});
