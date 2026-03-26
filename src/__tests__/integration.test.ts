import * as dotenv from "dotenv";
import * as fs from "fs";
dotenv.config();
import { exec } from "node:child_process";
import { _getCommitMessages, run } from "../create-release-notes";

jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../libs/git-utils");

function createBranch(branchName: string) {
    exec(`git checkout -b ${branchName}`);
}

function dummyCommit(jiraTicket: string) {
  exec(`echo "Dummy commit for ${jiraTicket}" > dummy.txt`);
  exec(`git add .`);
  exec(`git commit -m "${jiraTicket}: Dummy commit message"`);
}

const baseBranch = "main";

beforeAll(() => {
  // Create dummy git repository for testing
  fs.mkdirSync("test-repo", { recursive: true }); 
  process.chdir("./test-repo");
  exec(`git init`);
  exec(`git checkout -b ${baseBranch}`);
  exec(`echo "Initial commit" > README.md`);
  exec(`git add .`);
  exec(`git commit -m "Initial commit"`);
  // make sure we are in dummy repo for the tests
  expect(fs.existsSync(".git")).toBe(true);
  expect(process.cwd()).toContain("test-repo");
});

afterAll(() => {
  // Cleanup - delete the test repository
  process.chdir("..");
  fs.rmSync("test-repo", { recursive: true, force: true });
});


describe("Test git integration for create-release-notes", () => {
  let targetBranch: string;
  beforeAll(() => {
    // Setup - create a new branch and add some commits with Jira tickets
    targetBranch = `int-test-branch`;
    createBranch(targetBranch);
    dummyCommit("OVP-123");
    dummyCommit("OVP-456");
    dummyCommit("OVP-789");
  });

  afterAll(() => {
      // Cleanup - switch back to main and delete the test branch
    exec(`git checkout ${baseBranch} && git branch -D ${targetBranch}`);
  });

  test("getCommitMessages returns commit messages between branches", async () => {
    const commitMessages = await _getCommitMessages(baseBranch, targetBranch);
    expect(commitMessages).toEqual([
      "Commit message 1",
      "Commit message 2",
      "Commit message 3",
    ]);
  });
});


test("Integration test for create-release-notes", async () => {
  await run();
  // delete the branch after test
  exec(`git checkout main && git branch -D releases/v1.1.0`);
});
