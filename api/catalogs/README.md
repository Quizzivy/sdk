# Catalogs

Agreements between the server and its clients that are data, not HTTP shapes.
`make gen` copies them into the package (`sdk/catalogs/`), and each side tests
its own copy against the version it pins, so neither repository reads the
other's source.

| File | What it pins | Who tests against it |
|---|---|---|
| `audit-actions.json` | every audit action key with its Vietnamese and English sentence, in key order | api: `modules/audit/domain` lists exactly these; web: `audit.action` in `vi.json` and `en.json` words each one the same way |
| `join-code.json` | the class join code: alphabet, length, the hint length, and how it is grouped for display (§6.1) | api: `classes/domain` constants; web: `features/join/code` |

To change one, change it here and in the server in the same release: open the
sdk PR first, then the api PR that matches it (the same order as a contract
change).
