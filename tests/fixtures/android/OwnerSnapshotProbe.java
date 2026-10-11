package io.github.nightshang.chache.storage;

import java.io.File;
import java.lang.reflect.Field;
import java.nio.channels.FileLock;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Exercises the real helper; no SQLite or Android responsiveness claim. */
public final class OwnerSnapshotProbe {
    public static void main(String[] args) throws Exception {
        File path = new File(args[0]);
        readDuringOperation(path);
        readDuringRevocation(path);
        snapshotNeverGrantsAuthority(path);
        System.out.println("nonblocking owner snapshots, serialized writes, early revocation and actual-lock authority passed");
    }

    private static void readDuringOperation(File path) throws Exception {
        try (HostOwnership owner = HostOwnership.acquire(path, false)) {
            CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
            CountDownLatch secondAttempt = new CountDownLatch(1);
            AtomicReference<Throwable> error = new AtomicReference<>();
            StringBuilder writes = new StringBuilder();
            Thread first = worker("held-native-operation", error, () -> owner.withOwner(() -> {
                writes.append('1');entered.countDown();await(release);writes.append('2');return null;
            }));
            Thread second = worker("queued-native-operation", error, () -> {
                secondAttempt.countDown();owner.withOwner(() -> { writes.append('3');return null; });
            });
            first.start();await(entered);
            boolean responsive;
            try {
                responsive = snapshotCompletes(owner, true);
                second.start();await(secondAttempt);
                long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
                while (second.getState() != Thread.State.BLOCKED && second.isAlive() && System.nanoTime() < until) Thread.yield();
                if (second.getState() != Thread.State.BLOCKED) throw new AssertionError("Actual operations must still serialize on GATE");
            } finally {
                release.countDown();join(first);if (second.getState() != Thread.State.NEW) join(second);
            }
            if (error.get() != null) throw new AssertionError("Operation failed", error.get());
            if (!responsive) throw new AssertionError("UI ownership snapshot waited for a held native operation");
            if (!"123".equals(writes.toString())) throw new AssertionError("Writes were not serialized: " + writes);
        }
    }

    private static void readDuringRevocation(File path) throws Exception {
        HostOwnership owner = HostOwnership.acquire(path, false);
        CountDownLatch cleaning = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        owner.setCleanup(() -> { cleaning.countDown();await(release); });
        Thread closing = worker("held-owner-cleanup", error, owner::close);
        closing.start();await(cleaning);
        boolean responsive;
        try { responsive = snapshotCompletes(owner, false); }
        finally { release.countDown();join(closing); }
        if (error.get() != null) throw new AssertionError("Cleanup failed", error.get());
        if (!responsive) throw new AssertionError("Revoked snapshot waited for database cleanup or lock release");
        try (HostOwnership successor = HostOwnership.acquire(path, false)) {
            if (owner.isOwner() || !successor.isOwner()) throw new AssertionError("Wrong published generation");
            owner.close();if (!successor.isOwner()) throw new AssertionError("Late close revoked successor");
        }
    }

    private static void snapshotNeverGrantsAuthority(File path) throws Exception {
        try (HostOwnership owner = HostOwnership.acquire(path, false)) {
            // Test-only reflection simulates an invalidated OS lease without a lifecycle event.
            Field field = HostOwnership.class.getDeclaredField("lock");field.setAccessible(true);
            ((FileLock) field.get(owner)).release();
            AtomicBoolean ran = new AtomicBoolean();
            try { owner.withOwner(() -> { ran.set(true);return null; });throw new AssertionError("Invalid lock authorized an operation"); }
            catch (HostOwnership.Failure failure) { if (!"NOT_OWNER".equals(failure.code)) throw new AssertionError(failure.code); }
            if (ran.get()) throw new AssertionError("UI snapshot was used as write authority");
            try { owner.setCleanup(() -> {});throw new AssertionError("Invalid lock authorized cleanup registration"); }
            catch (HostOwnership.Failure failure) { if (!"NOT_OWNER".equals(failure.code)) throw new AssertionError(failure.code); }
        }
    }

    private static boolean snapshotCompletes(HostOwnership owner, boolean expected) throws Exception {
        CountDownLatch started = new CountDownLatch(1), finished = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        Thread reader = worker("ui-owner-snapshot", error, () -> {
            started.countDown();
            try { if (owner.isOwner() != expected) throw new AssertionError("Wrong ownership snapshot"); }
            finally { finished.countDown(); }
        });
        // A RED reader may be blocked by the intentionally held GATE; caller releases it.
        reader.setDaemon(true);reader.start();await(started);
        boolean responsive = finished.await(2, TimeUnit.SECONDS);
        if (responsive) join(reader);
        if (error.get() != null) throw new AssertionError("Snapshot failed", error.get());
        return responsive;
    }

    private static Thread worker(String name, AtomicReference<Throwable> error, Runnable action) {
        Thread thread = new Thread(action, name);thread.setUncaughtExceptionHandler((ignored, failure) -> error.set(failure));return thread;
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Probe coordination timed out"); }
        catch (InterruptedException failure) { Thread.currentThread().interrupt();throw new AssertionError(failure); }
    }
    private static void join(Thread thread) throws InterruptedException {
        thread.join(5000);if (thread.isAlive()) throw new AssertionError("Probe thread did not finish: " + thread.getName());
    }
}
