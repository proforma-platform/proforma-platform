# CCP Keys

Authoritative dictionary for CCP v1.

Rules:
- Reserved keys MUST be used exactly as defined.
- Unknown keys MUST NOT be used unless prefixed with `x_`.
- Key meanings are protocol-level and cannot be repurposed.

| key | meaning | type | required | notes |
| --- | --- | --- | --- | --- |
| `ccp_ver` | CCP version | string | yes | semver, current `1.0.0` |
| `id` | mission/correlation id | string | yes | unique per exchange context |
| `ts` | timestamp | string | yes | RFC3339 UTC recommended |
| `src` | context/source | string | no | origin descriptor |
| `br` | git branch | string | no | producer branch |
| `sha` | git commit hash | string | no | short or full SHA |
| `obj` | short objective | string | no | compact mission objective |
| `t` | tasks | array | no | ordered executable tasks |
| `ng` | non-goals | array | no | prohibited scope |
| `mod` | modified files | array | no | relative paths |
| `sw` | switch node/logic id | string | no | workflow routing focus |
| `expr` | expression/code | string | no | logic expression summary |
| `h` | HTTP status code | integer | no | test result field |
| `s` | status string/json | string | no | concise result status |
| `res` | response/result envelope | object | no | grouped results |
| `ts_tests` | tests collection timestamp | string | no | optional test snapshot |
| `x_*` | extension namespace | any | no | allowed for additive vendor keys |

Reserved keys:
- `ccp_ver`, `id`, `ts` are mandatory for all payload types.
- `status`, `error_code`, `message` are mandatory for error payloads.

Unknown key policy:
- Keys not listed here and not prefixed with `x_` SHOULD fail lint in strict mode.
