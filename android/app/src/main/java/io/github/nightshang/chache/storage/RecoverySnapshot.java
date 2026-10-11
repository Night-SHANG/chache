package io.github.nightshang.chache.storage;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;

/** Closed-file snapshot for this app's single DELETE-journal database, never a repair API. */
final class RecoverySnapshot implements AutoCloseable {
    private static final long JOURNAL_MAGIC = 0xd9d505f920a163d7L;
    private final File directory;
    final File databaseFile;

    private RecoverySnapshot(File directory) {
        this.directory = directory;
        databaseFile = new File(directory, "warehouse-v1.db");
    }

    static RecoverySnapshot create(File source, File privateCache) throws IOException {
        File journal = new File(source.getPath() + "-journal");
        requireSingleRollbackDatabase(source, journal);
        if (!privateCache.isDirectory()) throw new IOException("Private staging directory unavailable");
        File directory = new File(privateCache, "warehouse-recovery-" + UUID.randomUUID());
        if (!directory.mkdir()) throw new IOException("Private staging creation failed");
        RecoverySnapshot snapshot = new RecoverySnapshot(directory);
        try {
            copy(source, snapshot.databaseFile);
            copy(journal, new File(snapshot.databaseFile.getPath() + "-journal"));
            return snapshot;
        } catch (IOException | RuntimeException failure) {
            try { snapshot.close(); } catch (IOException cleanup) { failure.addSuppressed(cleanup); }
            throw failure;
        }
    }

    private static void requireSingleRollbackDatabase(File database, File journal) throws IOException {
        if (!database.isFile() || !journal.isFile() || journal.length() == 0 ||
            new File(database.getPath() + "-wal").exists() || new File(database.getPath() + "-shm").exists()) {
            throw new IOException("Only the fixed rollback journal can be staged");
        }
        try (RandomAccessFile input = new RandomAccessFile(database, "r")) {
            byte[] signature = new byte[16];input.readFully(signature);
            if (!Arrays.equals(signature, "SQLite format 3\0".getBytes(StandardCharsets.US_ASCII))) throw new IOException("Invalid SQLite header");
            input.seek(18);
            if (input.readUnsignedByte() != 1 || input.readUnsignedByte() != 1) throw new IOException("WAL recovery is unsupported");
        }
        // An attached-database super-journal name lives at the end of a rollback journal.
        // Do not let SQLite follow such a path while validating private copies.
        try (RandomAccessFile input = new RandomAccessFile(journal, "r")) {
            if (input.length() >= 16) {
                input.seek(input.length() - 16);
                long nameLength = (input.readInt() & 0xffffffffL);input.readInt();
                if (input.readLong() == JOURNAL_MAGIC && nameLength > 0) throw new IOException("Attached recovery is unsupported");
            }
        }
    }

    private static void copy(File source, File target) throws IOException {
        try (FileInputStream input = new FileInputStream(source); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[65536];
            for (int n; (n = input.read(buffer)) != -1;) output.write(buffer, 0, n);
        }
    }

    @Override public void close() throws IOException {
        // Only files created inside this unique private snapshot are eligible for cleanup.
        IOException failure = null;
        File[] copies = directory.listFiles();
        if (copies == null) throw new IOException("Cannot inspect private staging cleanup");
        for (File copy : copies) {
            if (!copy.delete()) failure = new IOException("Private staging cleanup failed");
        }
        if (!directory.delete()) failure = new IOException("Private staging cleanup failed");
        if (failure != null) throw failure;
    }
}
