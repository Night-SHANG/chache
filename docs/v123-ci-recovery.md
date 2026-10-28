# v1.0.23 CI recovery (2026-10-28)

Run 40608218160 attempt 1 never received a runner. The owner subsequently
made the repository public and explicitly requested compilation to continue.
Attempt 2 then ran successfully through native debug/release compilation,
JUnit/lint and unsigned release verification. Node regression was 3287 total:
3285 passed and the same 2 missing-original-art baseline failures; the strict
classifier reported accepted=true with zero unexpected failures. This is not
an unconditional all-tests-pass claim.

The later runtime handoff failed because the coordinator's two new GitHub
commit messages omitted the established `Local source snapshot` and
`Tree verified` metadata. The verifier correctly rejected null localCommit;
signing never ran. This was a provenance preparation error, not a game compile
error, and no provenance or test gate is removed to address it.

Recovery uses a real local Git checkout and commit, verifies the complete tree,
and carries that exact local commit/tree mapping in the remote commit message.
The public-repository build/sign guards require the exact owner repository,
push event and existing trusted branch. Pull-request triggers and secret
access are not broadened. The separate signing job still downloads only the
immutable current-run artifact and verifies it before exposing existing keys.
Because that binding is strict, the prior unsigned APK is not reused across
runs. The complete existing workflow runs again.

The repository is now public by the owner's action. Legacy artifact labels
containing "private" do not imply artifact confidentiality in a public repo.
