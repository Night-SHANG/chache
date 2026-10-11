package io.github.nightshang.chache.storage;

import java.io.File;
import java.io.IOException;

/** Test-only handshake lets the real host SQLite engine validate the real Java snapshot. */
public final class RecoverySnapshotProbe {
    public static void main(String[] args) throws Exception {
        try (RecoverySnapshot snapshot = RecoverySnapshot.create(new File(args[0]), new File(args[1]))) {
            System.out.println(snapshot.databaseFile.getAbsolutePath());System.out.flush();
            if (System.in.read() != '\n') throw new AssertionError("Missing test-engine completion");
        } catch (IOException error) {
            if (args.length == 3 && "expect-failure".equals(args[2])) {
                System.out.println("STAGING_FAILED");return;
            }
            throw error;
        }
    }
}
