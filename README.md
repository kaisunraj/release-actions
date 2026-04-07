![Coverage](coverage/badge-branches.svg) ![Coverage](coverage/badge-functions.svg) ![Coverage](coverage/badge-lines.svg) ![Coverage](coverage/badge-statements.svg)

# release-actions

TypeScript-based GitHub Actions for release automation:

- Create a release pull request from a target branch into a base branch.
- Generate release notes from release-branch commits and Jira ticket references.

## Actions

- [create-pr](create-pr/README.md): Raises a PR from target to base with a release-aware title.
- [create-release-notes](create-release-notes/README.md): Builds release notes from commit messages and creates/updates a GitHub release.

Both actions require a `github-token` input.

## Requirements

- Node.js 24 (`>=24 <25`)
- npm

## Setup

```bash
npm ci
```

## Build

```bash
npm run build
```

This builds both action bundles:

- `dist/pr-action/index.js`
- `dist/release-notes-action/index.js`

## Scripts

- `npm run build`: Build both actions with ncc.
- `npm run build:pr`: Build create-pr action bundle.
- `npm run build:release-notes`: Build create-release-notes action bundle.
- `npm run bundle`: Clean `dist` and rebuild.
- `npm run test`: Run Jest tests with coverage.
- `npm run typecheck`: Run TypeScript type checks.
- `npm run check`: Run typecheck and tests.
- `npm run prettier`: Format repository files.

## Development Notes

- Source files are under `src`.
- Action manifests are in `create-pr/action.yml` and `create-release-notes/action.yml`.
- Built bundles in `dist` are the runtime entrypoints referenced by the action manifests.
- Keep README input/output docs in sync with each action manifest.

## Testing And Mocks

- Unit tests are in `src/__tests__` and run with Jest + ts-jest.
- Shared manual mocks are in `src/__mocks__/@actions`.
- Prefer `jest.mock("@actions/core")` and `jest.mock("@actions/github")` in tests, then configure behavior via the shared mock functions.
- For full local verification, run `npm run check` before pushing changes.

## Local Validation

```bash
npm run check
```

## CI/Workflows

Workflow files are under `.github/workflows`.
