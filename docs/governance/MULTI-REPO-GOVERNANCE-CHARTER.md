# Proforma Group – Multi-Repository Governance Charter

Version: 1.0  
Status: Active  
Scope: Proforma Platform, ProformaFarm ERP, MEDCORE (and future solutions)

---

# 1. Purpose

This document defines the unified governance standard for all repositories under the Proforma ecosystem.

It ensures:

- Architectural coherence
- Versioning discipline
- Documentation integrity
- Operational maturity
- Clear separation of concerns
- Protection of shared infrastructure
- Scalable evolution

This charter applies to all current and future solutions.

---

# 2. Repository Identity Model

Each solution must be treated as an independent governed unit.

Official Chat Identifiers:

- [PLATFORM] → proforma-platform
- [PF-ERP] → ProformaFarm ERP
- [MEDCORE] → MEDCORE

Every technical discussion must explicitly declare its scope.

---

# 3. Mandatory Repository Structure

Every governed repository must contain:

## Root Level

- README.md (Institutional + Executive Technical)
- ROADMAP.md (Official Macro Roadmap – Single Source of Truth)
- CHANGELOG.md
- SECURITY.md
- CONTRIBUTING.md
- package.json (if applicable)
- Versioning via SemVer

## Documentation Layer

/docs/
    /architecture (ADRs)
    /context (Snapshot)
    /roadmap (Operational detail)
    /runbooks (if applicable)

---

# 4. Documentation Rules

## 4.1 README (Root)

Must contain:

- What the solution is
- Mission
- Architecture summary
- Technology stack
- Current roadmap phase
- How to run locally
- Governance and security references

It must NOT duplicate detailed documentation.

---

## 4.2 ROADMAP (Root)

- Official roadmap.
- Macro phases only.
- Status indication.
- Next increment clearly defined.
- Must not be duplicated elsewhere.

Files inside `/docs/roadmap/` are complementary, not authoritative.

---

## 4.3 Snapshot (Context Freeze)

Path:

/docs/context/PROJECT-CONTEXT-YYYY-MM.md

Rules:

- Frozen baseline per cycle.
- Never retroactively rewritten.
- Updated only when new governance cycle begins.

---

## 4.4 ADRs

- Sequential numbering.
- Immutable after approval.
- One decision per file.
- Stored in `/docs/architecture/`.

No duplicate ADR numbers allowed.

---

# 5. Versioning & Releases

All repositories must follow Semantic Versioning:

MAJOR.MINOR.PATCH

Initial baseline version: v0.1.0

Rules:

- MAJOR → breaking changes
- MINOR → new features
- PATCH → fixes

Each release requires:

- Updated CHANGELOG
- Git tag
- GitHub Release object
- Snapshot alignment (if structural changes)

---

# 6. Delivery Standard

Every completed task must include:

- Branch name
- Commit SHA
- PR URL
- Raw links of sentinel files
- Verification of build commands
- Explicit statement of infrastructure impact

No feature PR may modify:

- infra/
- docker-compose*
- Ports
- PostgreSQL
- n8n
- Shared services

Unless approved by ADR.

---

# 7. Infrastructure Protection Rule

UI features and documentation changes:

- Must not alter infrastructure.
- Must not introduce new services.
- Must not modify shared runtime configurations.

Infrastructure changes require:

- ADR
- Explicit roadmap alignment
- Separate review cycle

---

# 8. Cross-Repository Consistency

All repositories must:

- Follow identical governance structure.
- Use consistent versioning policy.
- Maintain documentation parity.
- Use unified delivery template.
- Respect infrastructure boundaries.

---

# 9. Platform Hierarchy Principle

Proforma Platform is the architectural parent.

Product repositories (ERP, MEDCORE, etc.):

- Must align with platform governance.
- Must not contradict platform decisions.
- May extend but not diverge from standards.

---

# 10. Governance Evolution

This charter itself must follow:

- ADR for changes.
- Versioned updates.
- Explicit changelog.

---

# 11. Strategic Objective

Transform independent repositories into:

A unified, governed, scalable, enterprise-grade ecosystem.

---

End of Document.
