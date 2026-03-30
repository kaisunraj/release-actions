# Create Release Notes Action

Generates release notes from commits between a base branch and a release branch.

## Inputs

| Name               | Required | Default                               | Description                                                 |
| ------------------ | -------- | ------------------------------------- | ----------------------------------------------------------- |
| `github-token`     | Yes      | -                                     | GitHub token used to authenticate API requests.             |
| `owner`            | Yes      | `${{ github.repository_owner }}`      | Repository owner (for example, `octocat`).                  |
| `repo`             | Yes      | `${{ github.event.repository.name }}` | Repository name (for example, `hello-world`).               |
| `base-branch`      | Yes      | -                                     | Branch to compare against (for example, `main`).            |
| `release-branch`   | Yes      | -                                     | Release branch to inspect (for example, `releases/v1.2.3`). |
| `confluence-space` | Yes      | -                                     | Confluence/Jira space key used to build Jira ticket links.  |

## Permissions

Github token used with this action must have `contents: write` permissions to create or update releases in the repository. The default token provided by GitHub Actions (`${{ github.token }}`) does not have the permission to create or update releases, so you must provide a custom token with the necessary permissions via repository secrets.

## Usage

```yaml
name: Create Release Notes

on:
  workflow_dispatch:

jobs:
  release-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run create-release-notes action
        uses: ./create-release-notes
        with:
          base-branch: main
          release-branch: releases/v1.2.3
          confluence-space: example
          github-token: ${{ secrets.PAT }}
```

## Notes

- Runtime: Node.js 24.
- Entry point: `../dist/release-notes-action/index.js`.
- This action creates or updates the GitHub release associated with the release branch tag.
