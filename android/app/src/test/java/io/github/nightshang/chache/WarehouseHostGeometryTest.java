package io.github.nightshang.chache;

/** Android-free assertions used by the local Node harness without pretending to exercise WindowInsets. */
public final class WarehouseHostGeometryTest {
    public static void main(String[] args) {
        WarehouseHostGeometry.Insets bars = new WarehouseHostGeometry.Insets(100, 0, 80, 0);
        WarehouseHostGeometry.Insets cutout = new WarehouseHostGeometry.Insets(60, 90, 0, 70);
        WarehouseHostGeometry.Insets gestures = new WarehouseHostGeometry.Insets(20, 20, 100, 40);
        WarehouseHostGeometry.Insets safe = WarehouseHostGeometry.maxInsets(bars, cutout, gestures);
        check(safe.top == 100 && safe.right == 90 && safe.bottom == 100 && safe.left == 70, "Insets use per-edge maximum, never addition");
        check(!WarehouseHostGeometry.owns(null), "Unattached storage has no ownership");
        check(WarehouseHostGeometry.owns(() -> true), "Actual owner is reported");
        check(!WarehouseHostGeometry.owns(() -> false), "Replaced owner is rejected");
        check(!WarehouseHostGeometry.owns(() -> { throw new IllegalStateException("lost storage"); }), "Owner failures fail closed");
        boolean rejected = false;
        try { new WarehouseHostGeometry.Insets(-1, 0, 0, 0); } catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, "Negative insets are rejected");
        WarehouseHostGeometry.Size early = WarehouseHostGeometry.size(false, 1080, 2400);
        check(early.widthPx == 0 && early.heightPx == 0, "Positive layout does not imply Insets are measured");
        WarehouseHostGeometry.Size unlaid = WarehouseHostGeometry.size(true, 0, 2400);
        check(unlaid.widthPx == 0 && unlaid.heightPx == 0, "Insets alone do not imply usable layout");
        WarehouseHostGeometry.Size ready = WarehouseHostGeometry.size(true, 1080, 2400);
        check(ready.widthPx == 1080 && ready.heightPx == 2400, "Measured Insets and layout publish physical pixels");
        check(!WarehouseHostGeometry.layoutChanged(true, 0, 0, 1080, 2400, 0, 0, 1080, 2400), "Measured unchanged bounds must not pause/save again");
        check(WarehouseHostGeometry.layoutChanged(false, 0, 0, 1080, 2400, 0, 0, 1080, 2400), "Initial unmeasured equal bounds still request Insets");
        check(WarehouseHostGeometry.layoutChanged(true, 1, 0, 1080, 2400, 0, 0, 1080, 2400), "Left movement invalidates measured Insets");
        check(WarehouseHostGeometry.layoutChanged(true, 0, 1, 1080, 2400, 0, 0, 1080, 2400), "Top movement invalidates measured Insets");
        check(WarehouseHostGeometry.layoutChanged(true, 0, 0, 1079, 2400, 0, 0, 1080, 2400), "Right change invalidates measured Insets");
        check(WarehouseHostGeometry.layoutChanged(true, 0, 0, 1080, 2399, 0, 0, 1080, 2400), "Bottom change invalidates measured Insets");
        System.out.println("WarehouseHostGeometry: 15 assertions passed (native Android APIs not run)");
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
