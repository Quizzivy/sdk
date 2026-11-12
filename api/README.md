# API contract

`openapi.yaml` is the single source of truth for the API. Spec §15 documents
it; everything else is generated from it.

Nothing here is written twice: in this repository `make gen` writes the
`@quizzivy/sdk` package (`sdk/`), whose types come from `openapi-typescript`.
The api repository generates its Go server interfaces (`oapi-codegen`) from the
version of this file it pins, and the web validates its MSW mocks against it
with `ajv`. Both fail their CI on drift.

Change the contract here first, then `make gen`. `make sdk-check` reports what
the change does to a client, and `oasdiff-ignore.txt` holds the checker's false
alarms (one rule per line, no comments: `sdk/README.md`). `info.version`
changes only in the release PR (`sdk/README.md`). `testdata/` and `catalogs/`
ship in the package too (`catalogs/README.md`).
