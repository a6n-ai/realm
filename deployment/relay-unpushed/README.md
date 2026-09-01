# Unpushed Relay commits (parked here because cursor[bot] cannot write `a6n-ai/relay`)

Base: `a3d51aa` on Relay. Origin `main` has moved to `c67e537` (git-protocol `@foundry/*`); rebase after apply.

```bash
cd ~/a6n-ai/relay
git checkout -b cursor/relay-email-platform-c501 origin/main
git am --3way /path/to/realm/deployment/relay-unpushed/*.patch
# resolve any conflict with c67e537, then:
git push -u origin cursor/relay-email-platform-c501
```

Apply from a machine that can push to `a6n-ai/relay` (your GitHub user, or a Cloud Agent whose Cursor GitHub App installation actually includes that repo).
