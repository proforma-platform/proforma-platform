# GOVHUB Snapshot Clients (UBIN v1)

Clients for packing/unpacking ultra-binary snapshots.

## SHA256 Definition
`payload_sha256` is computed over the **gzip-compressed payload bytes** (the bytes represented by `payload_b64`).

## Scripts
- `snapshot-pack.sh`
- `snapshot-pack.ps1`
- `snapshot-unpack.sh`
- `snapshot-unpack.ps1`

## Environment Variables
- `GOVHUB_SNAPSHOT_INGEST_URL` (default expected: `https://govhub.proforma.net.br/webhook/govhub/snapshots/ingest`)
- `GOVHUB_SNAPSHOT_LATEST_URL` (default expected: `https://govhub.proforma.net.br/webhook/govhub/snapshots/latest`)
- `GOVHUB_TOKEN`
- `GOVHUB_CREATED_BY` (optional, defaults to `cpp`)

## Pack (bash)
```bash
bash snapshot-pack.sh state_inventory_v1 /tmp/state_inventory.json platform 5f6976d
```

## Unpack (bash)
```bash
bash snapshot-unpack.sh "<payload_b64>" "<expected_sha256>" /tmp/state_inventory.out.json
```

## Pack (PowerShell)
```powershell
pwsh snapshot-pack.ps1 -SnapshotType state_inventory_v1 -InputJson /tmp/state_inventory.json -SourceRepo platform -SourceRef 5f6976d
```

## Unpack (PowerShell)
```powershell
pwsh snapshot-unpack.ps1 -PayloadB64 "<payload_b64>" -ExpectedSha256 "<sha>" -OutputPath /tmp/state_inventory.out.json
```

## Local Safety
Packing enforces:
- JSON parse validation
- secret scan with GOVHUB policy patterns
- decompressed payload size <= 256KB
