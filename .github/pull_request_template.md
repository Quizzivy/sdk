<!--
A contract change lands here first, then in api and web (README.md, "Changing the API").
-->

## What changed

<!-- Two or three sentences: which operations or schemas, and why. -->

## The api PR that implements it (D-082 (iii))

<!--
A contract PR merges into develop only when the api PR is open and green on
this contract (`make gen CONTRACT=../sdk/api/openapi.yaml` there). Delete this
section only for a change no server code depends on (a description, an example).
-->

- api PR: Quizzivy/api#___ (green on this branch's contract)
- web PR, if the web uses it: Quizzivy/web#___

## Checks

- [ ] Every new or changed operation declares `x-permission`
- [ ] Breaking? If oasdiff reports ERR, the PR carries `contract-breaking` and
      cites the D-entry or the owner's approval, with the release-notes line for
      tabs loaded before the deploy
- [ ] `info.version` is unchanged (it changes only in a release PR into `main`)
- [ ] `make gen` run and its output committed; a catalog change has its api PR too
