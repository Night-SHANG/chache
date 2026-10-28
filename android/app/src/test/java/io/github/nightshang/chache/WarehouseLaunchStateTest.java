package io.github.nightshang.chache;

/** Executable real-JVM state-machine tests; platform API behavior is covered by instrumentation. */
public final class WarehouseLaunchStateTest {
    private static int assertions;
    private static WarehouseLaunchState start() {
        WarehouseLaunchState state = new WarehouseLaunchState();
        state.resume(0);
        state.overlayAttached();
        state.updateHost(true, true, 1080, 2400, 30, 0, 40, 0);
        return state;
    }
    public static void main(String[] args) {
        WarehouseLaunchState early = new WarehouseLaunchState();
        early.resume(0);early.updateHost(true, true, 1080, 2400, 30, 0, 40, 0);
        long earlyRequest = early.requestFrame(early.snapshot());
        check(earlyRequest > 0, "Optional system splash does not gate valid frame confirmation");
        check(!early.isReady(), "Missing splash never bypasses native visual confirmation");
        check(early.visualReady(earlyRequest), "Native visual callback can confirm a no-splash launch");
        WarehouseLaunchState state = start();
        WarehouseLaunchState.Snapshot original = state.snapshot();
        long request = state.requestFrame(original);
        check(request > 0, "Complete same-geometry frame requests a visual callback");
        check(!state.isReady(), "JS frame alone cannot remove the splash");
        check(state.requestFrame(original) == 0, "Repeated JS frames cannot starve one in-flight visual callback");
        check(!state.visualReady(request + 1), "Unrequested callback is rejected");
        check(state.visualReady(request), "First current callback reveals immediately");
        check(state.isReady(), "Successful callback is acknowledged");
        check(!state.failed(), "A late failure cannot replace an already visible game");
        check(!state.deadline(100000), "Watchdog cannot replace successful game");
        check(state.requestFrame(original) == 0, "Success is terminal");
        state = start();original = state.snapshot();request = state.requestFrame(original);
        state.updateHost(true, true, 2400, 1080, 0, 30, 0, 40);
        check(!state.visualReady(request), "Callback for old geometry cannot expose a stretched frame");
        check(state.requestFrame(original) == 0, "Late JS signal for old geometry is rejected");
        state.updateHost(true, true, 1080, 2400, 30, 0, 40, 0);
        check(state.requestFrame(original) == 0, "Geometry returning to old dimensions still requires latest generation");
        request = state.requestFrame(state.snapshot());
        check(state.visualReady(request), "New generation can reveal normally");
        state = start();request = state.requestFrame(state.snapshot());
        state.updateHost(true, true, 1080, 2400, 31, 0, 40, 0);
        check(!state.visualReady(request), "Insets-only changes reject old callback");
        state = start();request = state.requestFrame(state.snapshot());state.invalidate();
        check(!state.visualReady(request), "Splash window-policy restoration invalidates pending callback");
        state = start();original = state.snapshot();request = state.requestFrame(original);state.pause(2000);
        check(!state.visualReady(request), "Hidden Activity cannot reveal");
        check(state.requestFrame(original) == 0, "Hidden Activity ignores queued JS frame");
        check(!state.deadline(100000), "Background time is not a failed startup");
        state.resume(100000);
        check(state.remaining(100000) == 13000, "Resume retains the remaining total foreground budget");
        check(state.requestFrame(original) == 0, "Hide/resume rejects old generation even with identical geometry");
        request = state.requestFrame(state.snapshot());check(state.visualReady(request), "Resume requires and accepts a fresh visible frame");
        state = start();state.pause(100);state.updateHost(false, true, 1080, 2400, 30, 0, 40, 0);
        state.resume(200);state.updateHost(true, true, 1080, 2400, 30, 0, 40, 0);
        original = state.snapshot();state.updateHost(true, true, 1080, 2400, 30, 0, 40, 0);
        check(state.snapshot().generation == original.generation, "Native snapshot refresh preserves the generation published after resume");
        check(state.requestFrame(original) > 0, "Published resume snapshot remains valid without another Insets event");
        state = start();state.updateHost(true, false, 1080, 2400, 30, 0, 40, 0);
        check(state.requestFrame(state.snapshot()) == 0, "Non-owner host cannot reveal");
        state = start();state.updateHost(true, true, 0, 0, 30, 0, 40, 0);
        check(state.requestFrame(state.snapshot()) == 0, "Unmeasured layout cannot reveal");
        state = start();request = state.requestFrame(state.snapshot());
        check(state.failed(), "Actual failure ends startup immediately");
        check(!state.visualReady(request), "Late success cannot replace failure");
        check(!state.isReady(), "Failure is not reported as a usable game");
        state = start();check(!state.deadline(14999), "Watchdog never creates a success delay");
        check(state.deadline(15000), "Fifteen-second real foreground stall ends with failure");
        check(state.isFailed(), "Watchdog exposes a genuine failure state");
        state = start();request = state.requestFrame(state.snapshot());state.destroy();
        check(!state.visualReady(request), "Destroyed Activity ignores late callback");
        check(!state.failed(), "Destroyed Activity never creates an error overlay");
        check(!state.deadline(15000), "Destroyed Activity cancels deadline");
        state = start();check(state.blocksTouch(true, false), "Touch down is swallowed while icon covers game");
        request = state.requestFrame(state.snapshot());state.visualReady(request);
        check(state.blocksTouch(false, true), "Gesture begun before reveal cannot activate the game on release");
        check(!state.blocksTouch(true, false), "New visible-game gesture is enabled");
        check(!state.blocksTouch(false, true), "Visible-game release is enabled");
        state = start();state.failed();check(state.blocksTouch(true, false), "Native error surface cannot click the underlying game");
        System.out.println("WarehouseLaunchState: " + assertions + " assertions passed (Android APIs not run)");
    }
    private static void check(boolean condition, String message) { assertions++;if (!condition) throw new AssertionError(message); }
}

