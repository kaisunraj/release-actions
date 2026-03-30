# Create Release PR Action

Raises a pull request from a target branch into a base branch.

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `base-branch` | Yes | - | Branch to merge into (for example, `main`). |
| `target-branch` | Yes | - | Branch to merge from (for example, `release/1.2.3`). |
| `github-token` | Yes | - | GitHub token used to authenticate API requests. |

## Outputs

| Name | Description |
| --- | --- |
| `pull-request-url` | URL of the created pull request. |

## Permissions

Github token used with this action must have `contents: read` and `pull-requests: write` permissions to create pull requests in the repository. The default token provided by GitHub Actions (`${{ github.token }}`) does not have the permission to create pull requests, so you must provide a custom token with the necessary permissions via repository secrets.

## Usage

```yaml
name: Create Release PR

on:
  workflow_dispatch:

jobs:
  create-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run create-pr action
        uses: ./create-pr
        with:
          base-branch: main
          target-branch: releases/v1.2.3
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Notes

- Runtime: Node.js 24.
- Entry point: `../dist/pr-action/index.js`.
