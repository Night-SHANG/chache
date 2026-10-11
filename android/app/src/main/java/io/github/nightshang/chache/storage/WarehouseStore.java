package io.github.nightshang.chache.storage;

import android.content.Context;
import android.database.Cursor;
import android.database.DatabaseErrorHandler;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteDatabaseCorruptException;
import android.database.sqlite.SQLiteDoneException;
import android.database.sqlite.SQLiteException;
import android.database.sqlite.SQLiteReadOnlyDatabaseException;
import android.database.sqlite.SQLiteStatement;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Fixed private SQLite KV. An uncertain connection never supplies acknowledgement readback. */
public final class WarehouseStore implements AutoCloseable {
    private static final String DATABASE_NAME = "warehouse-v1.db";
    private static final String CREATE_KV = "CREATE TABLE kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)";
    private static final int MAX_KEY_UNITS = 256;
    private static final int MAX_VALUE_UNITS = 2 * 1024 * 1024;
    // Android's default corruption handler deletes the database. Preservation is intentional.
    private static final DatabaseErrorHandler PRESERVE_CORRUPTION = database -> { };
    private final HostOwnership owner;
    private SQLiteDatabase database;
    private boolean unavailable;

    public static final class StorageFailure extends RuntimeException {
        public final String code;
        private StorageFailure(String code) { super(code);this.code = code; }
    }

    public WarehouseStore(Context context) { this(context, false); }
    public static WarehouseStore replace(Context context) { return new WarehouseStore(context, true); }

    private WarehouseStore(Context context, boolean replace) {
        File file = context.getApplicationContext().getDatabasePath(DATABASE_NAME);
        try { owner = HostOwnership.acquire(new File(file.getParentFile(), DATABASE_NAME + ".owner"), replace); }
        catch (HostOwnership.Failure failure) { throw fail(failure.code); }
        try {
            owned(() -> {
                owner.setCleanup(this::closeDatabase);
                open(file, context.getApplicationContext().getCacheDir());
                return null;
            });
        } catch (RuntimeException failure) {
            owner.close();
            throw mapped(failure);
        }
    }

    /** Read-only native host state; deliberately not a JavascriptInterface. */
    public boolean ownsHost() { return owner.isOwner(); }

    public String get(String key) {
        return operation(() -> {
            requireKey(key);
            // simpleQueryForString avoids CursorWindow's device-specific row-size limit.
            try (SQLiteStatement statement = database.compileStatement("SELECT value FROM kv WHERE key = ?")) {
                statement.bindString(1, key);
                try {
                    String value = statement.simpleQueryForString();
                    if (!validValue(value)) throw fail("CORRUPT_DB");
                    return value;
                } catch (SQLiteDoneException missing) { return null; }
            }
        });
    }

    public void set(String key, String value) {
        operation(() -> {
            requireKey(key);if (!validValue(value)) throw fail("INVALID_ARGUMENT");
            transaction(() -> {
                try (SQLiteStatement statement = database.compileStatement("INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)")) {
                    statement.bindString(1, key);statement.bindString(2, value);statement.executeInsert();
                }
            });
            return null;
        });
    }

    public void remove(String key) {
        operation(() -> {
            requireKey(key);
            transaction(() -> { database.delete("kv", "key = ?", new String[]{key}); });
            return null;
        });
    }

    public List<String> listKeys(String prefix) {
        return operation(() -> {
            requireKey(prefix);List<String> result = new ArrayList<>();
            // Bound namespace filter. Java prefix matching is literal (%, _ and UTF-16 included).
            try (Cursor cursor = database.rawQuery("SELECT key FROM kv WHERE key >= ?", new String[]{"warehouse."})) {
                while (cursor.moveToNext()) {
                    String key = cursor.getString(0);
                    if (!validKey(key)) throw fail("CORRUPT_DB");
                    if (key.startsWith(prefix)) result.add(key);
                }
            }
            Collections.sort(result);return result;
        });
    }

    private void open(File file, File privateCache) {
        boolean existing = file.exists();
        if (existing) {
            if (!file.isFile() || file.length() == 0) throw fail("CORRUPT_DB");
            // Reject future/damaged records before any writable connection or PRAGMA change.
            try (SQLiteDatabase inspection = SQLiteDatabase.openDatabase(file.getPath(), null,
                SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS, PRESERVE_CORRUPTION)) {
                inspect(inspection);
            } catch (SQLiteReadOnlyDatabaseException needsRollback) {
                // The failed inspection has closed before any copy is made. Ownership is
                // still held. SQLite may recover only private copies until their committed
                // contents prove compatible; future/corrupt originals are never touched.
                try (RecoverySnapshot snapshot = RecoverySnapshot.create(file, privateCache)) {
                    try (SQLiteDatabase recovery = SQLiteDatabase.openDatabase(snapshot.databaseFile.getPath(), null,
                        SQLiteDatabase.OPEN_READWRITE | SQLiteDatabase.NO_LOCALIZED_COLLATORS, PRESERVE_CORRUPTION)) {
                        inspect(recovery);
                    }
                } catch (IOException stagingFailure) { throw fail("IO_ERROR"); }
            }
        }
        database = SQLiteDatabase.openDatabase(file.getPath(), null,
            SQLiteDatabase.OPEN_READWRITE | SQLiteDatabase.NO_LOCALIZED_COLLATORS |
                (existing ? 0 : SQLiteDatabase.CREATE_IF_NECESSARY), PRESERVE_CORRUPTION);
        database.disableWriteAheadLogging();
        if (!"delete".equalsIgnoreCase(scalar(database, "PRAGMA journal_mode=DELETE"))) throw fail("DURABILITY_UNAVAILABLE");
        database.execSQL("PRAGMA synchronous=EXTRA");
        requireDurability();
        if (!existing) {
            transaction(() -> { database.execSQL(CREATE_KV);database.setVersion(1); });
        }
        inspect(database);
    }

    private static void inspect(SQLiteDatabase db) {
        int version = db.getVersion();
        if (version > 1) throw fail("UNSUPPORTED_VERSION");
        if (version != 1 || !"ok".equals(scalar(db, "PRAGMA quick_check(1)"))) throw fail("CORRUPT_DB");
        try (Cursor cursor = db.rawQuery("SELECT name,sql FROM sqlite_master WHERE type = ?", new String[]{"table"})) {
            if (!cursor.moveToFirst() || !"kv".equals(cursor.getString(0)) || !CREATE_KV.equals(cursor.getString(1)) || cursor.moveToNext()) throw fail("CORRUPT_DB");
        }
        try (Cursor cursor = db.rawQuery("SELECT name FROM sqlite_master WHERE type IN (?,?)", new String[]{"trigger", "view"})) {
            if (cursor.moveToFirst()) throw fail("CORRUPT_DB");
        }
    }

    private static String scalar(SQLiteDatabase db, String sql) {
        try (Cursor cursor = db.rawQuery(sql, null)) {
            if (!cursor.moveToFirst()) throw fail("DURABILITY_UNAVAILABLE");
            return cursor.getString(0);
        }
    }

    private void requireDurability() {
        if (!"delete".equalsIgnoreCase(scalar(database, "PRAGMA journal_mode")) || !"3".equals(scalar(database, "PRAGMA synchronous"))) {
            unavailable = true;throw fail("DURABILITY_UNAVAILABLE");
        }
    }

    private void transaction(Runnable write) {
        if (database.inTransaction()) { unavailable = true;throw fail("STORE_UNAVAILABLE"); }
        requireDurability();
        database.beginTransaction();
        try {
            write.run();database.setTransactionSuccessful();
        } finally {
            try {
                // The ONLY success boundary: returning from the real, non-nested COMMIT.
                // Finally also rolls back when a non-SQL throwable interrupts the statement.
                database.endTransaction();
            } catch (RuntimeException uncertain) {
                unavailable = true;throw fail("COMMIT_UNKNOWN");
            }
            if (database.inTransaction()) { unavailable = true;throw fail("COMMIT_UNKNOWN"); }
        }
    }

    private <T> T operation(HostOwnership.Action<T> action) {
        return owned(() -> {
            if (unavailable || database == null || !database.isOpen()) { unavailable = true;throw fail("STORE_UNAVAILABLE"); }
            if (database.inTransaction()) { unavailable = true;throw fail("STORE_UNAVAILABLE"); }
            try { return action.run(); }
            catch (RuntimeException failure) {
                // Statement constraint failures with completed rollback can still read old data.
                // All other I/O/read failures fail closed until a newly opened host verifies disk.
                if (!(failure instanceof android.database.sqlite.SQLiteConstraintException) &&
                    !(failure instanceof StorageFailure && "INVALID_ARGUMENT".equals(((StorageFailure) failure).code))) unavailable = true;
                throw mapped(failure);
            }
        });
    }

    private <T> T owned(HostOwnership.Action<T> action) {
        try { return owner.withOwner(action); }
        catch (HostOwnership.Failure failure) { throw fail(failure.code); }
    }

    private static StorageFailure mapped(RuntimeException error) {
        if (error instanceof StorageFailure) return (StorageFailure) error;
        if (error instanceof SQLiteDatabaseCorruptException) return fail("CORRUPT_DB");
        if (error instanceof SQLiteException || error instanceof SecurityException) return fail("IO_ERROR");
        return fail("STORE_UNAVAILABLE");
    }

    private static StorageFailure fail(String code) { return new StorageFailure(code); }
    private static void requireKey(String key) { if (!validKey(key)) throw fail("INVALID_ARGUMENT"); }
    private static boolean validKey(String key) { return key != null && key.startsWith("warehouse.") && key.length() <= MAX_KEY_UNITS && key.indexOf('\0') < 0 && wellFormed(key); }
    private static boolean validValue(String value) { return value != null && value.length() <= MAX_VALUE_UNITS && wellFormed(value); }
    private static boolean wellFormed(String value) {
        for (int i = 0; i < value.length(); i++) {
            char unit = value.charAt(i);
            if (Character.isHighSurrogate(unit)) { if (++i == value.length() || !Character.isLowSurrogate(value.charAt(i))) return false; }
            else if (Character.isLowSurrogate(unit)) return false;
        }
        return true;
    }

    private void closeDatabase() {
        unavailable = true;
        if (database != null) { if (database.isOpen()) database.close();database = null; }
    }
    @Override public void close() { owner.close(); }
}
