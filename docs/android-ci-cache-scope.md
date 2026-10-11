# Android CI cache resource scope

Run all helper commands from the repository root on the disposable Ubuntu
GitHub job. `RUNNER_TEMP` must already exist as an absolute canonical directory;
`HOME`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` and `GITHUB_JOB` must be present.

1. Before **any** npm or Gradle command, run:

   ```sh
   node scripts/android-ci-cache.mjs init --github-env "$GITHUB_ENV"
   ```

   This creates a unique `RUNNER_TEMP/android-ci-cache-XXXXXX` and exports
   `ANDROID_CI_CACHE_ROOT`, `ANDROID_CI_CACHE_TOKEN`, `GRADLE_USER_HOME`,
   `npm_config_cache` and `NPM_CONFIG_CACHE` for subsequent GitHub steps. The
   init command does not export variables back into its calling shell: place it
   in a preceding step, or use the API's returned `env` for a caller's child
   processes. Do not reassign these paths, change the job identity, or redirect
   Gradle's home with JVM options. The marker binds the root to this run,
   attempt, job, token and operating-system owner.

2. Complete npm installs, production builds, Node checks and native compilation.
   Preserve all original gates and artifacts. Ensure no npm/Gradle invocation
   is running concurrently, then run:

   ```sh
   node scripts/android-ci-cache.mjs release
   ```

   The helper validates the owned root and all entries without traversing any
   symlink, then runs the existing repository `android/gradlew` with explicit
   `--gradle-user-home <owned-home> --stop`, a 120-second command timeout and a
   bounded 10-second wait for PIDs recorded in that home's daemon logs to exit.
   It sends no termination signal to a PID. A failed/timed-out stop or a PID
   still alive refuses deletion and records the failure.

   Only `<owned-home>/caches`, `<owned-home>/wrapper/dists`, and the dedicated
   npm cache are deleted. npm's empty root is recreated. The owned root,
   marker, Gradle configuration/daemon evidence, repository outputs, APKs,
   reports and the default `HOME/.android/debug.keystore` remain. Default home
   caches, SDK directories, unowned/stale/missing roots, symlinks, signing-key
   files and contradictory Gradle-home JVM overrides are refused. There is
   no permission change, default-home cleanup or SDK installation fallback.

3. Before/after official SDK preparation and after emulator boot, measure the
   current filesystem rather than assuming the release created enough room:

   ```sh
   node scripts/android-ci-cache.mjs space preinstall
   node scripts/android-ci-cache.mjs space postinstall
   node scripts/android-ci-cache.mjs space postboot
   ```

   These write `build/android-ci/space-<stage>.json`. Schema 1 exposes
   `availableBytes` and `freeBytes` as identical observed `statfs.bavail ×
   bsize` byte counts on `RUNNER_TEMP`, plus `allocatedCacheBytes` measured
   from filesystem blocks. The caller must verify the SDK/AVD is on this
   filesystem and enforce its unchanged emulator capacity gate. No helper
   result relaxes that gate or establishes physical-phone performance.

Init retains `build/android-ci/cache-init-report.json` with ownership paths,
job identity and actual pre/post creation bytes. Release separately retains
`build/android-ci/cache-report.json` with exact targets, stop evidence,
`freeBeforeBytes`, `freeAfterBytes`, `allocatedBeforeBytes`,
`allocatedAfterBytes` and `releasedAllocatedBytes`. The ownership token is not
included in reports or CLI output. Allocated-byte reduction and actual free
space change are different observations; concurrent filesystem activity can
affect available space. Later Gradle commands may re-download caches into the
same dedicated home, so measure again at the relevant point.

The API exports `initCiCaches(env)`,
`releaseCiCaches({env, projectRoot})` and
`measureCiSpace({env, projectRoot, stage})`. Focused tests create only their own
temporary fixtures and never invoke the production Gradle wrapper or SDK.
