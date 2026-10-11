package io.github.nightshang.chache;

import android.os.Build;
import android.view.View;
import android.os.Looper;
import io.github.nightshang.chache.storage.WarehouseStore;
import io.github.nightshang.chache.storage.WarehouseStorageBridge;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.function.BooleanSupplier;

/** Physical window geometry and lifecycle only. Storage owns the actual writer capability. */
@CapacitorPlugin(name = "WarehouseHost")
public final class WarehouseHostPlugin extends Plugin {
    private static WarehouseHostPlugin currentHost;
    private WarehouseStore store;
    private volatile BooleanSupplier ownerSupplier;
    private boolean active, destroyed, insetsReady;
    private WarehouseHostGeometry.Insets safe = new WarehouseHostGeometry.Insets(0, 0, 0, 0);
    private View webView;
    private View.OnLayoutChangeListener layoutListener;
    private OnBackPressedCallback backCallback;

    /** Native-only attachment: Task4 supplies the live store owner predicate, never a JS override. */
    public void attachOwnerSupplier(BooleanSupplier supplier) {
        ownerSupplier = supplier;
        refreshOwnerState();
    }

    /** The storage lifecycle calls this after acquire, release, replacement or failure. */
    public void refreshOwnerState() {
        if (bridge != null) bridge.executeOnMainThread(() -> { if (!destroyed) publishState(); });
    }

    @Override
    public void load() {
        // Plugin.load runs during Bridge registration, before the first bundled navigation.
        // All current-host bookkeeping is on the Activity UI thread; the KV bridge itself
        // never waits for this thread and owns its separate lifetime storage capability.
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("Android host must initialize on UI thread");
        WarehouseHostPlugin previous = currentHost;
        try {
            store = WarehouseStore.replace(getContext());
            bridge.getWebView().addJavascriptInterface(new WarehouseStorageBridge(store), "WarehouseStorage");
            attachOwnerSupplier(store::ownsHost);
        } catch (WarehouseStore.StorageFailure unavailable) {
            // Preserve the database and show the generic blocked-storage startup message.
            // No second failure bridge or invented owner is installed.
            ownerSupplier = null;
        } finally {
            currentHost = this;
            if (previous != null && previous != this) previous.refreshOwnerState();
        }
        bridge.executeOnMainThread(() -> {
            if (destroyed) return;
            webView = bridge.getWebView();
            Window window = getActivity().getWindow();
            applyCutoutMode(window);
            WindowCompat.setDecorFitsSystemWindows(window, false);
            webView.setPadding(0, 0, 0, 0);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                safe = WarehouseHostGeometry.maxInsets(
                    hostInsets(insets.getInsets(WindowInsetsCompat.Type.systemBars())),
                    hostInsets(insets.getInsets(WindowInsetsCompat.Type.displayCutout())),
                    hostInsets(insets.getInsets(WindowInsetsCompat.Type.systemGestures()))
                );
                insetsReady = true;
                publishState();
                // Do not consume, pad, or inject CSS: JS applies this single authority exactly once.
                return insets;
            });
            layoutListener = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
                if (!WarehouseHostGeometry.layoutChanged(insetsReady, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom)) return;
                insetsReady = false;
                ViewCompat.requestApplyInsets(view);
                publishState();
            };
            webView.addOnLayoutChangeListener(layoutListener);
            backCallback = new OnBackPressedCallback(true) {
                @Override public void handleOnBackPressed() {
                    if (hasListeners("backButton")) notifyListeners("backButton", new JSObject());
                    else getActivity().moveTaskToBack(true); // Startup may be blocked before JS subscribes.
                }
            };
            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
            ViewCompat.requestApplyInsets(webView);
            publishState();
        });
    }

    /** Older Android versions do not infer the immersive cutout policy from target SDK. */
    private static void applyCutoutMode(Window window) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            } else {
                attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            window.setAttributes(attributes);
        }
    }

    private static WarehouseHostGeometry.Insets hostInsets(Insets value) {
        return new WarehouseHostGeometry.Insets(value.top, value.right, value.bottom, value.left);
    }

    private JSObject state() {
        JSObject insets = new JSObject();
        insets.put("top", safe.top); insets.put("right", safe.right); insets.put("bottom", safe.bottom); insets.put("left", safe.left);
        JSObject result = new JSObject();
        result.put("active", active && !destroyed);
        result.put("owner", !destroyed && WarehouseHostGeometry.owns(ownerSupplier));
        // Both layout and real Insets must be measured. Zero is a pending geometry signal.
        WarehouseHostGeometry.Size size = WarehouseHostGeometry.size(insetsReady, webView == null ? 0 : webView.getWidth(), webView == null ? 0 : webView.getHeight());
        result.put("widthPx", size.widthPx);
        result.put("heightPx", size.heightPx);
        result.put("insetsPx", insets);
        return result;
    }

    // Subscribe before getState(): a snapshot closes startup races without retaining stale event history.
    private void publishState() { notifyListeners("state", state()); }

    @PluginMethod
    public void getState(PluginCall call) {
        bridge.executeOnMainThread(() -> call.resolve(state()));
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            if (destroyed) { call.reject("Android host is destroyed", "HOST_INACTIVE"); return; }
            if (!getActivity().moveTaskToBack(true)) { call.reject("Cannot move Android task to background", "MINIMIZE_FAILED"); return; }
            call.resolve();
        });
    }

    @Override protected void handleOnResume() {
        active = true; insetsReady = false;
        if (webView != null) ViewCompat.requestApplyInsets(webView);
        publishState();
    }

    @Override protected void handleOnPause() { active = false; publishState(); }
    @Override protected void handleOnStop() { active = false; publishState(); }
    @Override protected void handleOnDestroy() {
        active = false; destroyed = true;
        if (store != null) store.close();
        ownerSupplier = null;
        if (currentHost == this) currentHost = null;
        bridge.getWebView().removeJavascriptInterface("WarehouseStorage");
        if (webView != null) {
            if (layoutListener != null) webView.removeOnLayoutChangeListener(layoutListener);
            ViewCompat.setOnApplyWindowInsetsListener(webView, null);
        }
        if (backCallback != null) backCallback.remove();
        publishState();
    }
}
