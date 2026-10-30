# Quizzivy API contract

The hub for the Quizzivy API contract (D-082): `api/openapi.yaml`, and
`@quizzivy/sdk`, the package generated from it that every client pins. A change
to the API starts here, then lands in [`Quizzivy/api`](https://github.com/Quizzivy/api)
and [`Quizzivy/web`](https://github.com/Quizzivy/web).

| Path | What it is |
|---|---|
| [`api/openapi.yaml`](api/openapi.yaml) | the contract, written by hand. Spec §15 documents it. |
| [`api/testdata/`](api/testdata/), [`api/catalogs/`](api/catalogs/) | data the server and its clients agree on, shipped in the package so each side tests the version it pins |
| [`sdk/`](sdk/) | the `@quizzivy/sdk` package: everything but `index.*` and `README.md` is written by `make gen` |
| [`tests/contract/`](tests/contract/) | the contract's structural and schema tests (Vitest) |
| [`scripts/sdk/`](scripts/sdk/) | the generator and the breaking-change gate, with their own tests |

## Working here

Node 24, pnpm 11, and Go 1.27 for `make sdk-check` (it runs oasdiff with
`go run`).

```bash
make install     # the test tools
make gen         # lint, test, regenerate sdk/
make sdk-check   # what this branch does to a client, against the merge-base
make help
```

CI runs `make gen-check`, the scripts' tests and the gate on every PR.

## Changing the API

Contract first, code second:

1. **PR here.** Edit `api/openapi.yaml` (or a catalog), `make gen`, commit the
   result. CI lints, tests, checks for drift and runs oasdiff against the
   merge-base. A breaking change needs the `contract-breaking` label and a
   D-entry or the owner's approval (D-080).
2. **PR in api** on the same contract (`make gen CONTRACT=../sdk/api/openapi.yaml`
   there). The server does not build until every new operation has a handler.
   **This PR merges into `develop` only once that api PR is green** (D-082 (iii)).
   A change that is dropped is reverted here before the next release, so no
   contract ships that the server does not serve.
3. **Merge here:** `publish.yml` publishes `X.Y.(Z+1)-dev.<time>.g<sha>` under
   `next`. The api PR pins that version and merges.
4. **PR in web:** pin the same version (`pnpm sdk:next`), typecheck.

Locally you can do all three at once before opening any PR: `make gen
CONTRACT=../sdk/api/openapi.yaml` in api and `pnpm link ../sdk/sdk` in web.

## Releases

One version line: SDK `X.Y.Z` is the contract of app release `X.Y.Z`
(`info.version`, D-080). It changes only in the release PR into `main`, and
the gate asks for a new minor (while 0.x) when that release breaks the contract.

1. Release PR into `main` sets `info.version` and runs `make gen`.
2. The owner pushes the tag `vX.Y.Z` here: `publish.yml` publishes `X.Y.Z` under `next`.
   When the contract is the same as `latest` apart from `info.version`, nothing
   is published (D-080) and api and web keep pinning the version they have.
3. api and web pin `X.Y.Z` in their own release PRs.
4. Once the API deploy is live, the api repository's deploy sends
   `repository_dispatch` (`promote-sdk`, with the version its commit pins) and
   `promote.yml` moves `latest` to it (D-081, D-082 (iv)). If that dispatch
   fails, the deploy run shows a warning: run **Actions → Promote → Run
   workflow** with the version.

So `latest` is always a contract production serves, and `next` is the newest
contract on `develop` or the release waiting for its deploy.

`latest` follows the deployed API both ways: rolling the API back to a commit
that pins an older release moves `latest` back to it too. GitHub runs
`repository_dispatch` and the manual run from the workflow file on the default
branch, `develop`.

## Using the package

See [`sdk/README.md`](sdk/README.md).
