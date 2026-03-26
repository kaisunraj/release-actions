import dotenv from "dotenv";
import { TARGET_BRANCH } from "../../__tests__/constants";
dotenv.config();

module.exports = {
  getInput: jest.fn((name) => {
    if (name === "github-token") return process.env.GITHUB_TOKEN || "fake-token";
    if (name === "base-branch") return "main";
    if (name === "target-branch") return "develop";
    if (name === "release-branch") return TARGET_BRANCH;
  }),
  setFailed: jest.fn(),
  info: jest.fn(),
  setOutput: jest.fn(),
};
