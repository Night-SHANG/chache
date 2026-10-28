package io.github.nightshang.chache;

/** Real launch policy only; does not claim Android compositor or Tap sandbox coverage. */
public final class WarehouseOptionalSplashTest {
    private static int assertions;
    private static WarehouseLaunchState withoutSplash() {
        WarehouseLaunchState state = new WarehouseLaunchState();
        state.resume(0);state.updateHost(true, true, 1080, 2400, 30, 0, 40, 0);
        return state;
    }
    public static void main(String[] args) {
        WarehouseLaunchState state = withoutSplash();
        check(state.waitingStage().equals("FRAME"), "Waiting for JS frame has a non-sensitive diagnostic stage");
        check(state.blocksTouch(true, false), "No-splash startup still blocks input before native visual confirmation");
        long request = state.requestFrame(state.snapshot());
        check(state.waitingStage().equals("VISUAL"), "Pending compositor callback is identified separately");
        check(request > 0, "A valid frame can request native visual confirmation without system splash exit");
        check(!state.isReady(), "JS frame alone is never sufficient");
        check(state.visualReady(request), "Native visual confirmation can reveal without system splash exit");
        check(state.blocksTouch(false, true), "A gesture begun before confirmation stays blocked");
        check(!state.blocksTouch(true, false), "New touches work after native visual confirmation");
        state.overlayAttached();
        check(state.isReady() && !state.deadline(15000), "Late splash notification cannot undo completed launch");

        state = withoutSplash();request = state.requestFrame(state.snapshot());state.overlayAttached();
        check(!state.visualReady(request), "Splash arrival during pending launch invalidates old geometry confirmation");
        request = state.requestFrame(state.snapshot());
        check(request > 0 && state.visualReady(request), "Fresh confirmation succeeds after late splash arrives while waiting");

        state = withoutSplash();request = state.requestFrame(state.snapshot());
        check(!state.deadline(14999) && state.deadline(15000), "No-splash mode still fails closed if visual callback never completes");
        check(!state.visualReady(request) && state.blocksTouch(true, false), "A late visual callback cannot override timeout failure");

        state = withoutSplash();state.updateHost(true, false, 1080, 2400, 30, 0, 40, 0);
        check(state.waitingStage().equals("OWNER"), "Missing storage ownership has a diagnostic stage, not a bypass");
        check(state.requestFrame(state.snapshot()) == 0, "Missing ownership still prevents reveal without splash");
        state = withoutSplash();state.updateHost(true, true, 0, 0, 0, 0, 0, 0);
        check(state.waitingStage().equals("GEOMETRY"), "Unmeasured Insets have a diagnostic stage");
        check(state.requestFrame(state.snapshot()) == 0, "Unmeasured geometry still prevents reveal without splash");
        state = withoutSplash();request = state.requestFrame(state.snapshot());state.pause(1000);
        check(state.waitingStage().equals("HOST"), "Inactive foreground has a diagnostic stage");
        check(!state.visualReady(request), "Background cannot reveal without splash");
        state.resume(2000);request = state.requestFrame(state.snapshot());
        check(request > 0 && state.visualReady(request), "Fresh foreground confirmation succeeds without splash");
        System.out.println("WarehouseOptionalSplash: " + assertions + " assertions passed (Android APIs not run)");
    }
    private static void check(boolean condition, String message) { assertions++;if (!condition) throw new AssertionError(message); }
}
