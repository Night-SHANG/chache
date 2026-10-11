package io.github.nightshang.chache.storage;

import android.webkit.JavascriptInterface;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Only install on the restricted bundled HTTPS WebView, before its initial navigation. */
public final class WarehouseStorageBridge {
    private final WarehouseStore store;
    private interface Action { Object run(); }
    public WarehouseStorageBridge(WarehouseStore store) { this.store = store; }

    @JavascriptInterface public String get(String key) { return respond(() -> store.get(key)); }
    @JavascriptInterface public String set(String key, String value) { return respond(() -> { store.set(key, value);return null; }); }
    @JavascriptInterface public String remove(String key) { return respond(() -> { store.remove(key);return null; }); }
    @JavascriptInterface public String listKeys(String prefix) { return respond(() -> new JSONArray(store.listKeys(prefix))); }

    private String respond(Action action) {
        try {
            Object value = action.run();
            return new JSONObject().put("v", 1).put("ok", true).put("value", value == null ? JSONObject.NULL : value).toString();
        } catch (WarehouseStore.StorageFailure failure) { return failure(failure.code); }
        catch (RuntimeException | JSONException unexpected) { return failure("STORE_UNAVAILABLE"); }
    }
    private static String failure(String code) {
        // Codes originate from this package, never exception text, SQL, private paths or save data.
        try { return new JSONObject().put("v", 1).put("ok", false).put("code", code).toString(); }
        catch (JSONException impossible) { return "{\"v\":1,\"ok\":false,\"code\":\"STORE_UNAVAILABLE\"}"; }
    }
}
