# GOV-0070 — Branch and Release Policy

## Policy Scope

This policy defines mandatory controls for branch governance and release discipline in the Proforma Platform repository.

## Main Branch Protection

The `main` branch is protected by default and follows these mandatory rules:

1. Pull Request is required for every change.
2. Minimum one approval is required before merge.
3. All review conversations must be resolved before merge.
4. Linear history is required.
5. Force push is prohibited.
6. Branch deletion is prohibited.
7. Continuous Integration must be green before merge.

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

This policy is part of repository governance and must be observed in all release cycles.
