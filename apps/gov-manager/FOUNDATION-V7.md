# Gov-Manager V7 Foundation

## Components
- TDV 1.0 schema and signal validator: `src/tdv/schema-v1.ts`
- UDN canonical engine: `src/udn/canonical-engine.ts`
- Ledger V7 chain primitives: `src/infra/ledger-v7.ts`
- Contract adapter legacy->v7: `src/contracts/adapter-v7.ts`

## Determinism Model
- Hashing uses SHA-256 (`src/core/determinism.ts`).
- JSON hashing uses stable key ordering.
- Ledger genesis hash is deterministic.
- UDN engine normalizes line endings and whitespace before hashing.

## API Boundary
- Mission route: `src/app/api/mission/route.ts`
- Contract version returned: `v7-baseline`
- Adapter accepts legacy envelope and normalizes to V7 mission contract.

## Notes
- No dynamic timestamps are used for contract-level deterministic identifiers.
- Build reproducibility verification remains dependent on network-capable `npm ci`.
