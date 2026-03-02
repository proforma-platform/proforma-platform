# GOV-0070 — Branch and Release Policy

## Policy Scope

This policy defines mandatory controls for branch governance and release discipline in the Proforma Platform repository.

## Enforcement on GitHub (Required Settings)

GitHub Branch Protection for `main` MUST be configured to enforce this policy with the following settings:

- Require a pull request before merging
- Require approvals (minimum 1)
- Require review from Code Owners
- Require conversation resolution
- Require status checks to pass before merging (build, lint, typecheck, test)
- Require branches to be up to date before merging
- Require linear history
- Include administrators
- Restrict who can push to matching branches (recommended)
- Disable force pushes
- Disable branch deletion

## Main Branch Protection

The `main` branch MUST follow these mandatory rules:

1. Pull Request MUST be required for every change.
2. Minimum one approval MUST be required before merge.
3. All review conversations MUST be resolved before merge.
4. Linear history MUST be required.
5. Force push MUST NOT be allowed.
6. Branch deletion MUST NOT be allowed.
7. Continuous Integration checks MUST be green before merge.

## Pull Request Governance

Every Pull Request must provide:

1. Clear scope and objective.
2. Evidence of validation for the declared scope.
3. Explicit statement of non-impacted critical domains when applicable.

## Release Tagging Discipline

Releases follow Semantic Versioning (SemVer):

1. Tags are created only from validated changes in `main`.
2. Tag naming uses the `vX.Y.Z` format.
3. Tag creation requires release evidence attached to the delivery report.

## Public Release Evidence Requirements

Before a public release tag:

1. Lighthouse evidence is required for public web scope.
2. `CHANGELOG.md` must be updated.
3. Context snapshot update is required in `docs/context/`.

## Enforcement

This policy is part of repository governance and MUST be enforced through GitHub branch protection configuration and release controls in every cycle.
