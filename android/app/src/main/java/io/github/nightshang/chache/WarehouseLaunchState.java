package io.github.nightshang.chache;

/** UI-thread-only, Android-free launch policy. A JS frame is a request, never a reveal. */
public final class WarehouseLaunchState {
    public static final long WATCHDOG_MS = 15000;
    private enum Phase { WAITING, READY, FAILED, DESTROYED }
    private Phase phase = Phase.WAITING;
    private boolean foreground, overlay, blockedGesture;
    private long generation, requestSequence, pendingRequest, pendingGeneration;
    private long foregroundStarted, foregroundElapsed;
    private Snapshot host = new Snapshot(0, false, false, 0, 0, 0, 0, 0, 0);

    public static final class Snapshot {
        public final long generation;
        public final boolean active, owner;
        public final int width, height, top, right, bottom, left;
        public Snapshot(long generation, boolean active, boolean owner, int width, int height, int top, int right, int bottom, int left) {
            this.generation = generation;this.active = active;this.owner = owner;
            this.width = width;this.height = height;this.top = top;this.right = right;this.bottom = bottom;this.left = left;
        }
        private boolean sameGeometry(Snapshot other) {
            return other != null && active == other.active && owner == other.owner && width == other.width && height == other.height
                && top == other.top && right == other.right && bottom == other.bottom && left == other.left;
        }
        private boolean usable() {
            return active && owner && width > 0 && height > 0 && top >= 0 && right >= 0 && bottom >= 0 && left >= 0
                && (long) left + right < width && (long) top + bottom < height;
        }
    }

    public long updateHost(boolean active, boolean owner, int width, int height, int top, int right, int bottom, int left) {
        Snapshot next = new Snapshot(generation, active, owner, width, height, top, right, bottom, left);
        if (!host.sameGeometry(next)) { host = next;invalidate(); }
        return generation;
    }
    public Snapshot snapshot() { return new Snapshot(generation, host.active, host.owner, host.width, host.height, host.top, host.right, host.bottom, host.left); }
    public void invalidate() { generation++;pendingRequest = 0; }
    public void overlayAttached() { overlay = true;invalidate(); }
    public void resume(long now) {
        if (phase != Phase.WAITING || foreground) return;
        foreground = true;foregroundStarted = now;invalidate();
    }
    public void pause(long now) {
        if (!foreground) return;
        foregroundElapsed += Math.max(0, now - foregroundStarted);foreground = false;invalidate();
    }
    public long remaining(long now) { return Math.max(0, WATCHDOG_MS - foregroundElapsed - (foreground ? Math.max(0, now - foregroundStarted) : 0)); }
    public boolean deadline(long now) {
        if (phase != Phase.WAITING || !foreground || remaining(now) > 0) return false;
        return failed();
    }
    public long requestFrame(Snapshot expected) {
        if (phase != Phase.WAITING || !foreground || !overlay || pendingRequest != 0 || !host.usable()
            || expected == null || expected.generation != generation || !host.sameGeometry(expected)) return 0;
        pendingRequest = ++requestSequence;pendingGeneration = generation;return pendingRequest;
    }
    public void cancelVisual(long request) { if (pendingRequest == request) pendingRequest = 0; }
    public boolean visualReady(long request) {
        if (phase != Phase.WAITING || !foreground || !overlay || !host.usable() || request == 0 || request != pendingRequest || pendingGeneration != generation) return false;
        phase = Phase.READY;pendingRequest = 0;return true;
    }
    public boolean failed() {
        if (phase != Phase.WAITING) return false;
        phase = Phase.FAILED;invalidate();return true;
    }
    public boolean isReady() { return phase == Phase.READY; }
    public boolean isFailed() { return phase == Phase.FAILED; }
    public boolean isWaiting() { return phase == Phase.WAITING; }
    public void destroy() { phase = Phase.DESTROYED;foreground = false;invalidate(); }
    public boolean blocksTouch(boolean startsGesture, boolean endsGesture) {
        if (startsGesture) blockedGesture = !isReady();
        boolean block = !isReady() || blockedGesture;
        if (endsGesture) blockedGesture = false;
        return block;
    }
}
