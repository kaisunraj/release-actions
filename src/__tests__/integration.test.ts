import * as dotenv from "dotenv";
import * as fs from "fs";
dotenv.config();
import { exec, execSync } from "node:child_process";
import { _getCommitMessages, run } from "../create-release-notes";
import { TARGET_BRANCH } from "./constants";

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
  // if dummy repo already exists, delete it and create a new one to ensure a clean state for the tests
  if (fs.existsSync("test-repo")) {
    fs.rmSync("test-repo", { recursive: true, force: true });
  }
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
  createBranch(TARGET_BRANCH);
  dummyCommit("OVP-123");
  dummyCommit("OVP-456");
  dummyCommit("OVP-789");
});

afterAll(() => {
  // Cleanup - delete the test repository
  process.chdir("..");
  fs.rmSync("test-repo", { recursive: true, force: true });
});

test("getCommitMessages returns commit messages between branches", async () => {
  expect(process.cwd()).toContain("test-repo");
  const currentBranch = execSync("git branch --show-current").toString().trim();
  expect(currentBranch).toBe(TARGET_BRANCH);
  const commitMessages = await _getCommitMessages(baseBranch, TARGET_BRANCH);
  expect(commitMessages).toEqual([
    "OVP-789: Dummy commit message",
    "OVP-456: Dummy commit message",
    "OVP-123: Dummy commit message",
  ]);
});
