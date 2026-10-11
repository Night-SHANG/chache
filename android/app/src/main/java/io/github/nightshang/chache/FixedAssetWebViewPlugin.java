package io.github.nightshang.chache;

import android.webkit.WebSettings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Replaces the built-in deployment API before Capacitor loads any web assets. */
@CapacitorPlugin(name = "WebView")
public final class FixedAssetWebViewPlugin extends Plugin {
    @Override
    public void load() {
        WebSettings settings = bridge.getWebView().getSettings();
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        bridge.setWebViewClient(new OfflineWebViewClient(bridge));
    }

    @PluginMethod
    public void setServerBasePath(PluginCall call) {
        call.reject("Bundled Android assets cannot be replaced", "ASSET_ROOT_IMMUTABLE");
    }

    @PluginMethod
    public void setServerAssetPath(PluginCall call) {
        call.reject("Bundled Android assets cannot be replaced", "ASSET_ROOT_IMMUTABLE");
    }

    @PluginMethod
    public void persistServerBasePath(PluginCall call) {
        call.reject("Bundled Android assets cannot be replaced", "ASSET_ROOT_IMMUTABLE");
    }

    @PluginMethod
    public void getServerBasePath(PluginCall call) {
        JSObject result = new JSObject();
        result.put("path", "public");
        call.resolve(result);
    }
}
