# Android v1.0.23 / versionCode 13: optional system splash

Base: ef8c46c24f4c00a8c6f5d6cb2209678c071a93d6 (v1.0.22 / vc12).

The system splash exit callback is no longer a prerequisite for accepting a
valid game frame. Activity ownership, nonzero geometry, the current generation,
foreground state and native WebView visual confirmation remain mandatory.
Late splash callbacks remove their overlay without revoking an already-ready
game. Startup failure now includes a read-only waiting-stage code (FRAME,
GEOMETRY, OWNER, VISUAL or lifecycle state); diagnostic text adds no new gate.

The normal Node test runner executes both native JVM test classes. The final
native state tests cover 42 existing assertions plus 20 optional-splash and
diagnostic assertions. Local focused build/signing/startup tests passed 43/43.
The dependency graph, APK application ID, signing identity source, storage,
gameplay, media and existing isolated signing procedure are unchanged.

Version metadata advances together to 1.0.23 / vc13; debug upgrade acceptance
codes remain 1 and 2. The release-lock checksum changes only because the root
package version changes. Existing baseline missing original-art failures must
remain separately accounted for; no assertions or baseline policy are removed.

This is a targeted compatibility fix, not evidence that the Tap sandbox works.
Cloud CI, exact signed APK verification and the user's Tap sandbox retest are
separate evidence stages. Do not clear user data or uninstall to bypass a
signature mismatch. Preserve existing history and signing configuration.
