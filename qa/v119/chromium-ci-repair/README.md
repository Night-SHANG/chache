# v119 Chromium CI launch correction

CI 38476462630 failed before any browser assertions: downloaded Chrome for Testing 151 under a runner-temporary directory had “No usable sandbox”. All 14 cases stayed NOT RUN; signing and native runtime jobs did not run. This is not a product test pass.

The run identifies the official ubuntu24/20261004.327 image. Its preinstalled stable Google Chrome is packaged from Google's official Debian package. Chromium documents that Ubuntu ships the existing AppArmor policy for `/opt/google/chrome/chrome`, while arbitrary downloaded developer/testing binaries do not match it.

Only the QA launcher configuration changes: use the runner's existing stable Chrome at that exact path, verify the executable and installed `google-chrome-stable` package, retain Playwright 1.62.1 and `chromiumSandbox: true`. The receipt records executable, channel classification and actual browser version. No browser is copied into a trusted path, no AppArmor/profile/sysctl/SUID settings are changed, and no sandbox-disabling flags or skipped gates are added. Actual success remains conditional on the rerun completing all assertions.

Official sources reviewed:
- https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
- https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/scripts/build/install-google-chrome.sh
- https://github.com/actions/runner-images/blob/ubuntu24/20261004.327/images/ubuntu/Ubuntu2404-Readme.md
- https://playwright.dev/docs/browsers#google-chrome--microsoft-edge

No product files or audio bytes changed in this correction. Existing 3262-test product run remains 3260 pass / two known missing-authoring-PNG failures. New QA-policy tests and affected CI/startup tests are rerun separately.
