# 0006. Marketplace install is the default

- Status: accepted
- Date: 2026-09-18

## Context

A person installing this plugin to use it, not to develop it, should not need a local checkout
or a `--plugin-dir` flag on every invocation. `claude plugin marketplace add` and
`claude plugin install` are the ordinary path, the one pull-request-pane and grilling-pane both
moved to.

## Decision

`.claude-plugin/marketplace.json`, at the repository root, declares a one-plugin marketplace
named `draft-pane`, from the first commit. `claude plugin marketplace add meganemura/draft-pane`
then `claude plugin install draft-pane@draft-pane` installs it. `--plugin-dir` stays as the
development loop only, documented below both commands in the README.

## Consequences

- Two manifests carry the plugin's description: `plugin/.claude-plugin/plugin.json` and the
  marketplace entry's `plugins[0].description`. Keeping them equal is a discipline; neither
  validator checks the other (`claude plugin validate .` and `claude plugin validate plugin`
  each check their own manifest only).
