package io.github.nightshang.chache.storage;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.webkit.JavascriptInterface;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real SQLite integration. Faults are introduced only here, never through a production API. */
@RunWith(AndroidJUnit4.class)
public class WarehouseStoreTest {
    private Context context;
    private File file;

    @Before public void isolatedDatabase() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(target.getCacheDir(), "storage-test-" + UUID.randomUUID());
        assertTrue(directory.mkdirs());
        context = new ContextWrapper(target) {
            @Override public Context getApplicationContext() { return this; }
            @Override public File getDatabasePath(String name) { return new File(directory, name); }
        };
        file = context.getDatabasePath("warehouse-v1.db");
    }

    @Test public void durableReopenPreservesMissingEmptyChineseAndBoundParameters() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            assertNull(store.get("warehouse.missing"));
            store.set("warehouse.empty", "");
            store.set("warehouse.中文", "最后一格📦");
            store.set("warehouse.'; DROP TABLE kv; --", "bound");
            store.set("warehouse.%_literal", "percent");
            assertEquals(Arrays.asList("warehouse.%_literal"), store.listKeys("warehouse.%_"));
            assertEquals("delete", scalar(database(store), "PRAGMA journal_mode"));
            assertEquals("3", scalar(database(store), "PRAGMA synchronous"));
            assertEquals("1", scalar(database(store), "PRAGMA user_version"));
            assertFalse(database(store).inTransaction());
        }
        try (WarehouseStore store = new WarehouseStore(context)) {
            assertEquals("", store.get("warehouse.empty"));
            assertEquals("最后一格📦", store.get("warehouse.中文"));
            assertEquals("bound", store.get("warehouse.'; DROP TABLE kv; --"));
            store.remove("warehouse.empty");store.remove("warehouse.missing");
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertNull(store.get("warehouse.empty")); }
    }

    @Test public void fullUtf16LimitRoundTripsWithoutCursorWindowTruncation() {
        char[] chars = new char[2 * 1024 * 1024];Arrays.fill(chars, '中');String value = new String(chars);
        char[] suffix = new char[246];Arrays.fill(suffix, 'x');String key = "warehouse." + new String(suffix);
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set(key, value);assertEquals(value, store.get(key));
            failure("INVALID_ARGUMENT", () -> store.set(key + "x", "v"));
            failure("INVALID_ARGUMENT", () -> store.set("warehouse.tooLong", value + "x"));
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals(value, store.get(key)); }
    }

    @Test public void rollbackLeavesOldValueOnDiskAndDoesNotAcknowledge() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set("warehouse.a", "old");
            SQLiteDatabase db = database(store);
            db.execSQL("CREATE TEMP TRIGGER reject_write BEFORE INSERT ON kv BEGIN SELECT RAISE(ABORT, 'injected statement failure'); END");
            WarehouseStorageBridge bridge = new WarehouseStorageBridge(store);
            JSONObject response = new JSONObject(bridge.set("warehouse.a", "new"));
            assertFalse(response.getBoolean("ok"));assertEquals("IO_ERROR", response.getString("code"));
            assertFalse(db.inTransaction());assertEquals("old", store.get("warehouse.a"));
            db.execSQL("DROP TRIGGER reject_write");
            db.execSQL("CREATE TEMP TRIGGER reject_remove BEFORE DELETE ON kv BEGIN SELECT RAISE(ABORT, 'injected remove failure'); END");
            assertFalse(new JSONObject(bridge.remove("warehouse.a")).getBoolean("ok"));
            assertEquals("old", store.get("warehouse.a"));
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("old", store.get("warehouse.a")); }
    }

    @Test public void realDiskFullFailureCannotExposeUncommittedValue() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set("warehouse.a", "old");SQLiteDatabase db = database(store);
            String pages = scalar(db, "PRAGMA page_count");
            assertEquals(pages, scalar(db, "PRAGMA max_page_count=" + pages));
            char[] chars = new char[512 * 1024];Arrays.fill(chars, 'x');
            JSONObject result = new JSONObject(new WarehouseStorageBridge(store).set("warehouse.a", new String(chars)));
            assertFalse(result.getBoolean("ok"));
            assertTrue(Arrays.asList("IO_ERROR", "COMMIT_UNKNOWN").contains(result.getString("code")));
            failure("STORE_UNAVAILABLE", () -> store.get("warehouse.a"));
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("old", store.get("warehouse.a")); }
    }

    @Test public void outerCommitFailurePoisonsConnectionAndReopenSeesRollback() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set("warehouse.a", "old");SQLiteDatabase db = database(store);
            // Deferred FK violation is checked at actual COMMIT, after setTransactionSuccessful().
            db.execSQL("PRAGMA foreign_keys=ON");assertEquals("1", scalar(db, "PRAGMA foreign_keys"));
            db.execSQL("CREATE TEMP TABLE parent(id INTEGER PRIMARY KEY)");
            db.execSQL("CREATE TEMP TABLE child(id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)");
            db.execSQL("CREATE TEMP TRIGGER fail_commit AFTER INSERT ON main.kv BEGIN INSERT INTO child VALUES(99); END");
            WarehouseStorageBridge bridge = new WarehouseStorageBridge(store);
            JSONObject response = new JSONObject(bridge.set("warehouse.a", "uncommitted"));
            assertFalse(response.getBoolean("ok"));assertEquals("COMMIT_UNKNOWN", response.getString("code"));
            failure("STORE_UNAVAILABLE", () -> store.get("warehouse.a"));
            assertFalse(new JSONObject(bridge.get("warehouse.a")).getBoolean("ok"));
        }
        try (WarehouseStore reopened = new WarehouseStore(context)) { assertEquals("old", reopened.get("warehouse.a")); }
    }

    @Test public void externallyNestedTransactionCannotReportSuccess() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set("warehouse.a", "old");SQLiteDatabase db = database(store);db.beginTransaction();
            try { failure("STORE_UNAVAILABLE", () -> store.set("warehouse.a", "uncommitted")); }
            finally { db.endTransaction(); }
            failure("STORE_UNAVAILABLE", () -> store.get("warehouse.a"));
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("old", store.get("warehouse.a")); }
    }

    @Test public void closedConnectionReadNeverPretendsTheAccountIsMissing() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set("warehouse.a", "old");database(store).close();
            failure("STORE_UNAVAILABLE", () -> store.get("warehouse.a"));
            failure("STORE_UNAVAILABLE", () -> store.listKeys("warehouse."));
        }
    }

    @Test public void alteredDurabilityIsRejectedRatherThanSilentlyAccepted() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            store.set("warehouse.a", "old");database(store).execSQL("PRAGMA synchronous=OFF");
            failure("DURABILITY_UNAVAILABLE", () -> store.set("warehouse.a", "new"));
            failure("STORE_UNAVAILABLE", () -> store.get("warehouse.a"));
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("old", store.get("warehouse.a")); }
    }

    @Test public void corruptDatabaseIsPreservedByteForByte() throws Exception {
        byte[] damaged = new byte[8192];Arrays.fill(damaged, (byte) 0x6b);
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(damaged); }
        failure("CORRUPT_DB", () -> new WarehouseStore(context));
        assertArrayEquals(damaged, bytes(file));
        failure("CORRUPT_DB", () -> new WarehouseStore(context));assertArrayEquals(damaged, bytes(file));
    }

    @Test public void futureDatabaseIsPreservedByteForByteBeforeWritableOpen() throws Exception {
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(file.getPath(), null,
            SQLiteDatabase.CREATE_IF_NECESSARY | SQLiteDatabase.NO_LOCALIZED_COLLATORS)) {
            db.execSQL("CREATE TABLE future(payload TEXT)");db.execSQL("INSERT INTO future VALUES('keep me')");db.setVersion(99);
        }
        byte[] original = bytes(file);failure("UNSUPPORTED_VERSION", () -> new WarehouseStore(context));
        assertArrayEquals(original, bytes(file));
    }

    @Test public void invalidSchemaIsPreservedAndNoEmptyReplacementIsCreated() throws Exception {
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(file.getPath(), null,
            SQLiteDatabase.CREATE_IF_NECESSARY | SQLiteDatabase.NO_LOCALIZED_COLLATORS)) {
            db.execSQL("CREATE TABLE kv(key TEXT, value TEXT)");db.execSQL("INSERT INTO kv VALUES('warehouse.a','keep me')");db.setVersion(1);
        }
        byte[] original = bytes(file);failure("CORRUPT_DB", () -> new WarehouseStore(context));assertArrayEquals(original, bytes(file));
    }

    @Test public void extraSchemaObjectCannotHideBehindSqliteLikeWildcard() throws Exception {
        try (WarehouseStore store = new WarehouseStore(context)) {
            database(store).execSQL("CREATE TABLE sqlitexfuture(payload TEXT)");
        }
        byte[] original = bytes(file);failure("CORRUPT_DB", () -> new WarehouseStore(context));assertArrayEquals(original, bytes(file));
    }

    @Test public void actualKilledWriterJournalRecoversOldValueAndCanReopenAgain() throws Exception {
        installHotJournal("valid");
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("old", store.get("warehouse.a")); }
        try (WarehouseStore store = new WarehouseStore(context)) {
            assertEquals("old", store.get("warehouse.a"));store.set("warehouse.afterRecovery", "committed");
        }
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("committed", store.get("warehouse.afterRecovery")); }
    }

    @Test public void futureHotJournalPreservesBothOriginalFilesOnRepeatedAttempts() throws Exception {
        rejectedHotJournal("future", "UNSUPPORTED_VERSION");
    }

    @Test public void corruptHotJournalPreservesBothOriginalFilesOnRepeatedAttempts() throws Exception {
        rejectedHotJournal("corrupt", "CORRUPT_DB");
    }

    @Test public void stagingFailureLeavesHotJournalUntouchedAndLaterRetryRecovers() throws Exception {
        installHotJournal("valid");File journal = new File(file.getPath() + "-journal");
        byte[] original = bytes(file), rollback = bytes(journal);
        File blocked = new File(file.getParentFile(), "not-a-cache-directory");assertTrue(blocked.createNewFile());
        Context blockedCache = new ContextWrapper(context) {
            @Override public Context getApplicationContext() { return this; }
            @Override public File getCacheDir() { return blocked; }
        };
        failure("IO_ERROR", () -> new WarehouseStore(blockedCache));
        assertArrayEquals(original, bytes(file));assertArrayEquals(rollback, bytes(journal));
        try (WarehouseStore store = new WarehouseStore(context)) { assertEquals("old", store.get("warehouse.a")); }
    }

    @Test public void missingPathPermissionFailureIsNotAnEmptySave() throws Exception {
        File blocked = new File(file.getParentFile(), "not-a-directory");assertTrue(blocked.createNewFile());
        Context blockedContext = new ContextWrapper(context) {
            @Override public Context getApplicationContext() { return this; }
            @Override public File getDatabasePath(String name) { return new File(blocked, name); }
        };
        failure("IO_ERROR", () -> new WarehouseStore(blockedContext));
        assertFalse(file.exists());
    }

    @Test public void ownershipLastsBetweenCallsReplacementRevokesOldAndLateCloseCannotRevokeNew() throws Exception {
        WarehouseStore first = new WarehouseStore(context);WarehouseStorageBridge oldBridge = new WarehouseStorageBridge(first);
        try {
            first.set("warehouse.a", "old");assertTrue(first.ownsHost());
            failure("OWNER_BUSY", () -> new WarehouseStore(context));
            try (WarehouseStore second = WarehouseStore.replace(context)) {
                assertFalse(first.ownsHost());assertTrue(second.ownsHost());
                assertEquals("NOT_OWNER", new JSONObject(oldBridge.set("warehouse.a", "stale")).getString("code"));
                first.close();assertTrue(second.ownsHost());
                failure("OWNER_BUSY", () -> new WarehouseStore(context));
                second.set("warehouse.a", "new");assertEquals("new", second.get("warehouse.a"));
                failure("NOT_OWNER", () -> first.get("warehouse.a"));
            }
            try (WarehouseStore third = new WarehouseStore(context)) { assertEquals("new", third.get("warehouse.a")); }
        } finally { first.close(); }
    }

    @Test public void bridgeExportsOnlyFourValidatedKvMethodsAndStrictEnvelopes() throws Exception {
        Set<String> exposed = new HashSet<>();
        for (Method method : WarehouseStorageBridge.class.getMethods()) if (method.isAnnotationPresent(JavascriptInterface.class)) exposed.add(method.getName());
        assertEquals(new HashSet<>(Arrays.asList("get", "set", "remove", "listKeys")), exposed);
        try (WarehouseStore store = new WarehouseStore(context)) {
            WarehouseStorageBridge bridge = new WarehouseStorageBridge(store);
            JSONObject missing = new JSONObject(bridge.get("warehouse.missing"));
            assertEquals(3, missing.length());assertEquals(1, missing.getInt("v"));assertTrue(missing.getBoolean("ok"));assertTrue(missing.isNull("value"));
            for (String key : new String[]{null, "", "warehouse", "outside.a", "warehouse.\u0000bad", "warehouse.\ud800"}) {
                for (String response : new String[]{bridge.get(key), bridge.set(key,"v"), bridge.remove(key), bridge.listKeys(key)}) {
                    JSONObject error = new JSONObject(response);assertEquals(3,error.length());assertFalse(error.getBoolean("ok"));assertEquals("INVALID_ARGUMENT",error.getString("code"));
                }
            }
            assertEquals("INVALID_ARGUMENT", new JSONObject(bridge.set("warehouse.a", null)).getString("code"));
            assertEquals("INVALID_ARGUMENT", new JSONObject(bridge.set("warehouse.a", "\ud800")).getString("code"));
        }
    }

    private void rejectedHotJournal(String kind, String code) throws Exception {
        installHotJournal(kind);File journal = new File(file.getPath() + "-journal");
        byte[] original = bytes(file), rollback = bytes(journal);
        for (int attempt = 0; attempt < 2; attempt++) {
            failure(code, () -> new WarehouseStore(context));
            assertArrayEquals(original, bytes(file));assertArrayEquals(rollback, bytes(journal));
        }
    }

    private void installHotJournal(String kind) throws Exception {
        Context testContext = InstrumentationRegistry.getInstrumentation().getContext();
        try (InputStream input = testContext.getAssets().open("storage/" + kind + "-hot-journal.zip"); ZipInputStream zip = new ZipInputStream(input)) {
            int count = 0;
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null;) {
                assertTrue(Arrays.asList("warehouse-v1.db", "warehouse-v1.db-journal").contains(entry.getName()));
                try (FileOutputStream output = new FileOutputStream(new File(file.getParentFile(), entry.getName()))) {
                    byte[] buffer = new byte[8192];for (int n; (n = zip.read(buffer)) != -1;) output.write(buffer, 0, n);
                }
                count++;
            }
            assertEquals(2, count);
        }
    }

    @After public void removeOnlyTestSandbox() { removeTestFile(file.getParentFile()); }
    private static void removeTestFile(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) removeTestFile(child);
        assertTrue("Cannot remove test fixture " + file.getName(), file.delete());
    }

    private static SQLiteDatabase database(WarehouseStore store) throws Exception {
        Field field = WarehouseStore.class.getDeclaredField("database");field.setAccessible(true);return (SQLiteDatabase) field.get(store);
    }
    private static String scalar(SQLiteDatabase db, String sql) {
        try (Cursor cursor = db.rawQuery(sql, null)) { assertTrue(cursor.moveToFirst());return cursor.getString(0); }
    }
    private static byte[] bytes(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];for (int n; (n = input.read(buffer)) != -1;) output.write(buffer, 0, n);return output.toByteArray();
        }
    }
    private static void failure(String code, Runnable action) {
        try { action.run();fail("Expected " + code); }
        catch (WarehouseStore.StorageFailure failure) { assertEquals(code, failure.code); }
    }
}
