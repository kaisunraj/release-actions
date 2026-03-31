import { warning } from "@actions/core";

module.exports = {
  getInput: jest.fn((name) => {
    if (name === "github-token") return "fake-token";
    if (name === "base-branch") return "main";
    if (name === "target-branch") return "develop";
    if (name === "release-branch") return "releases/v999.9.9";
  }),
  setFailed: jest.fn(),
  info: jest.fn(),
  setOutput: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addDetails: jest.fn().mockReturnThis(),
    addList: jest.fn().mockReturnThis(),
    write: jest.fn(),
  },
};
