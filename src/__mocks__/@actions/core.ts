import dotenv from "dotenv";
dotenv.config();

module.exports = {
  getInput: jest.fn((name) => {
    if (name === "github-token") return process.env.GITHUB_TOKEN || "fake-token";
    if (name === "base-branch") return "main";
    if (name === "target-branch") return "develop";
    
  }),
  setFailed: jest.fn(),
  info: jest.fn(),
  setOutput: jest.fn(),
};
