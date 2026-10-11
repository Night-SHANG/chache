# Independent emulator infrastructure probe

Only pushes to `dev/android-v110-emulator-probe` run this35-minute pure infrastructure job. The release workflow and acceptance gates are unchanged. No product build, full regression rerun, package dependency install or private APK retrieval occurs. Official checkout/Node24.19/JDK21/artifact Actions stay pinned; contents access is read-only.

The script observes existing writable workspace, runner temporary directory and `/mnt` without mounts, permission changes or deletion. It measures again after installing the same stable official emulator/API36 Google APIs x86_64 image, using closed stdin and only a previously accepted matching SDK agreement. A unique task-owned disposable AVD is placed on a measured writable volume with enough available space.

[Official emulator source](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android-qemu2-glue/main.cpp) enforces at least6GiB userdata for API24+ and checks1.2× available disk space. This probe adds512MiB headroom; it does not try an ineffective smaller partition or bypass the official guard. Missing writable space remains explicitly blocked.

Exactly one900-second TCG cold-boot attempt uses `ANDROID_I_WANT_MY_TCG=yes` and `-accel off`. [Official documentation](https://developer.android.com/studio/run/emulator-commandline) labels software emulation unsupported and very slow. The fixed evidence artifact preserves actual Java/package versions, space observations, official install/AVD/boot logs and available API/build/WebView facts. Cleanup stops only the probe's emulator; no large AVD or other data is deleted to manufacture success.

`status: booted` means an observed API36 infrastructure boot only. Product, storage, upgrade, gameplay and performance checks have not run. Timing is not representative of phone performance. Missing tools/space, new agreement requests, early exit or900-second timeout stay blocked. This probe cannot approve or deliver a phone candidate.

The reserved serial is checked before preparation and again before launch; an existing endpoint is refused without stopping it. Each AVD has a unique task name. Official `adb emu avd name` must match that name before boot/API/build/WebView evidence can be accepted and before endpoint shutdown. Unverified or replaced endpoints never receive `emu kill`; cleanup can still terminate only the process started by this probe. Fixed occupancy/identity logs preserve this boundary for review.
