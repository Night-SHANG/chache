package io.github.nightshang.chache.storage;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;

/** A lease lasts for the whole host, including pauses and gaps between KV operations. */
final class HostOwnership implements AutoCloseable {
    private static final Object GATE = new Object();
    private static HostOwnership active;
    private final RandomAccessFile handle;
    private final FileLock lock;
    private boolean revoked;
    private Runnable cleanup;

    interface Action<T> { T run(); }
    static final class Failure extends RuntimeException {
        final String code;
        Failure(String code) { super(code);this.code = code; }
    }

    private HostOwnership(RandomAccessFile handle, FileLock lock) { this.handle = handle;this.lock = lock; }

    static HostOwnership acquire(File path, boolean replace) {
        synchronized (GATE) {
            if (active != null) {
                if (!replace) throw new Failure("OWNER_BUSY");
                active.close(); // Drain any call, revoke the old generation and close its DB first.
            }
            RandomAccessFile handle = null;
            try {
                File directory = path.getParentFile();
                if (directory == null || (!directory.isDirectory() && !directory.mkdirs())) throw new IOException("Private directory unavailable");
                handle = new RandomAccessFile(path, "rw");
                FileLock lock = handle.getChannel().tryLock();
                if (lock == null) throw new Failure("OWNER_BUSY");
                active = new HostOwnership(handle, lock);
                return active;
            } catch (IOException | OverlappingFileLockException | SecurityException | Failure error) {
                if (handle != null) try { handle.close(); } catch (IOException ignored) { /* No acquired lease. */ }
                if (error instanceof Failure) throw (Failure) error;
                throw new Failure(error instanceof OverlappingFileLockException ? "OWNER_BUSY" : "IO_ERROR");
            }
        }
    }

    <T> T withOwner(Action<T> action) {
        synchronized (GATE) {
            if (!isOwner()) throw new Failure("NOT_OWNER");
            return action.run();
        }
    }

    void setCleanup(Runnable action) {
        synchronized (GATE) {
            if (!isOwner() || cleanup != null) throw new Failure("NOT_OWNER");
            cleanup = action;
        }
    }

    boolean isOwner() {
        synchronized (GATE) { return active == this && !revoked && lock.isValid(); }
    }

    @Override public void close() {
        synchronized (GATE) {
            if (revoked) return;
            revoked = true;
            if (active == this) active = null;
            try {
                if (cleanup != null) cleanup.run();
            } finally {
                cleanup = null;
                try { lock.release(); } catch (IOException ignored) { /* Closing the handle also releases it. */ }
                try { handle.close(); } catch (IOException ignored) { /* Lease is already permanently revoked. */ }
            }
        }
    }
}
