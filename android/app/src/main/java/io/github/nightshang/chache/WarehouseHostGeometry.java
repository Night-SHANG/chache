package io.github.nightshang.chache;

import java.util.function.BooleanSupplier;

/** Android-free calculations shared by the real host and executable local JVM assertions. */
public final class WarehouseHostGeometry {
    private WarehouseHostGeometry() {}

    public static final class Insets {
        public final int top, right, bottom, left;
        public Insets(int top, int right, int bottom, int left) {
            if (top < 0 || right < 0 || bottom < 0 || left < 0) throw new IllegalArgumentException("Negative host inset");
            this.top = top; this.right = right; this.bottom = bottom; this.left = left;
        }
    }

    public static Insets maxInsets(Insets bars, Insets cutout, Insets gestures) {
        return new Insets(
            Math.max(bars.top, Math.max(cutout.top, gestures.top)),
            Math.max(bars.right, Math.max(cutout.right, gestures.right)),
            Math.max(bars.bottom, Math.max(cutout.bottom, gestures.bottom)),
            Math.max(bars.left, Math.max(cutout.left, gestures.left))
        );
    }

    public static final class Size {
        public final int widthPx, heightPx;
        private Size(int widthPx, int heightPx) { this.widthPx = widthPx; this.heightPx = heightPx; }
    }

    /** Zero denotes startup/re-layout pending; callers must wait rather than assume zero Insets. */
    public static Size size(boolean insetsReady, int widthPx, int heightPx) {
        return insetsReady && widthPx > 0 && heightPx > 0 ? new Size(widthPx, heightPx) : new Size(0, 0);
    }

    /** A forced no-op layout must not emit pending geometry after Insets were already measured. */
    public static boolean layoutChanged(boolean insetsReady, int left, int top, int right, int bottom, int oldLeft, int oldTop, int oldRight, int oldBottom) {
        return !insetsReady || left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom;
    }

    public static boolean owns(BooleanSupplier supplier) {
        if (supplier == null) return false;
        try { return supplier.getAsBoolean(); } catch (RuntimeException unavailable) { return false; }
    }
}
