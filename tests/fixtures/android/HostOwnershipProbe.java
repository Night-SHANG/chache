package io.github.nightshang.chache.storage;

import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Compiles and runs the real ownership helper without Android stubs. */
public final class HostOwnershipProbe {
    public static void main(String[] args) throws Exception {
        File file = new File(args[0]);
        if (args.length > 1) {
            rejects("OWNER_BUSY", () -> HostOwnership.acquire(file, false));
            return;
        }
        HostOwnership first = HostOwnership.acquire(file, false);
        AtomicBoolean firstClosed = new AtomicBoolean();
        first.withOwner(() -> { first.setCleanup(() -> firstClosed.set(true));return null; });
        rejects("OWNER_BUSY", () -> HostOwnership.acquire(file, false));
        if (!first.isOwner()) throw new AssertionError("Ownership was released between calls");
        Process other = new ProcessBuilder(System.getProperty("java.home") + "/bin/java", "-cp",
            System.getProperty("java.class.path"), HostOwnershipProbe.class.getName(), file.toString(), "child").inheritIO().start();
        if (other.waitFor() != 0) throw new AssertionError("Cross-process lock check failed");
        CountDownLatch entered = new CountDownLatch(1), finish = new CountDownLatch(1), replacing = new CountDownLatch(1);
        AtomicBoolean replacementFinished = new AtomicBoolean();
        HostOwnership[] second = new HostOwnership[1];
        AtomicReference<Throwable> threadFailure = new AtomicReference<>();
        Thread call = new Thread(() -> first.withOwner(() -> {
            entered.countDown();try { if (!finish.await(5, TimeUnit.SECONDS)) throw new AssertionError("Call timeout"); }
            catch (InterruptedException failure) { throw new AssertionError(failure); }return null;
        }));
        call.setUncaughtExceptionHandler((thread, failure) -> threadFailure.set(failure));
        call.start();if (!entered.await(5, TimeUnit.SECONDS)) throw new AssertionError("Call never started");
        Thread replace = new Thread(() -> { replacing.countDown();second[0] = HostOwnership.acquire(file, true);replacementFinished.set(true); });
        replace.setUncaughtExceptionHandler((thread, failure) -> threadFailure.set(failure));
        replace.start();if (!replacing.await(5, TimeUnit.SECONDS)) throw new AssertionError("Replacement never started");
        Thread.sleep(40);if (replacementFinished.get()) throw new AssertionError("Replacement overtook in-flight call");
        finish.countDown();call.join(5000);replace.join(5000);
        if (call.isAlive() || replace.isAlive() || threadFailure.get() != null) throw new AssertionError("Concurrent owner failed", threadFailure.get());
        if (!replacementFinished.get() || !firstClosed.get() || first.isOwner() || !second[0].isOwner()) throw new AssertionError("Lifetime replacement failed");
        rejects("NOT_OWNER", () -> first.withOwner(() -> null));
        first.close();if (!second[0].isOwner()) throw new AssertionError("Late close revoked successor");
        rejects("OWNER_BUSY", () -> HostOwnership.acquire(file, false));second[0].close();
        HostOwnership third = HostOwnership.acquire(file, false);if (!third.isOwner()) throw new AssertionError("Reacquire failed");third.close();
        System.out.println("ownership lifetime, replacement, stale calls, late close, in-flight serialization and cross-process lock passed");
    }
    private static void rejects(String code, Runnable action) {
        try { action.run();throw new AssertionError("Expected " + code); }
        catch (HostOwnership.Failure failure) { if (!code.equals(failure.code)) throw new AssertionError(failure.code); }
    }
}
