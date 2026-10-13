package io.github.nightshang.chache;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.TextView;
import androidx.core.splashscreen.SplashScreenViewProvider;
import java.util.function.Supplier;
import org.json.JSONException;
import org.json.JSONObject;

/** Retains the original system splash overlay without blocking WebView draw/rAF. */
final class WarehouseLaunchHandoff {
    static final int BACKGROUND = Color.rgb(12, 19, 28);
    private static final String FAILURE = "无法开始游戏\nAndroid 启动检查失败\n已有存档未被清空。";
    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final WarehouseLaunchState state = new WarehouseLaunchState();
    private SplashScreenViewProvider overlay;
    private WebView webView;
    private Supplier<JSONObject> hostState;
    private TextView failureView;
    private boolean destroyed;
    private volatile boolean revealed;
    private final Runnable watchdog = () -> {
        if (!destroyed && state.deadline(SystemClock.uptimeMillis())) showFailure(FAILURE);
    };

    WarehouseLaunchHandoff(MainActivity activity) {
        this.activity = activity;
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(BACKGROUND));
    }
    void attachWebView(WebView view, Supplier<JSONObject> snapshot) {
        webView = view;hostState = snapshot;
        view.setBackgroundColor(BACKGROUND);
        view.setOnTouchListener((target, event) -> state.blocksTouch(
            event.getActionMasked() == MotionEvent.ACTION_DOWN,
            event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL
        ));
        view.addJavascriptInterface(new LaunchBridge(), "WarehouseLaunch");
    }
    void onSplashExit(SplashScreenViewProvider provider) {
        if (destroyed) { provider.remove();return; }
        overlay = provider;
        state.overlayAttached();
        // core-splashscreen 1.2.0 restores decorFits on API 31/32 immediately before this
        // listener. Reapply our existing host policy, then measure fresh Insets under cover.
        activity.restoreImmersiveAfterSplash();
        if (state.isFailed()) removeOverlay();
    }
    long updateHost(boolean active, boolean owner, int width, int height, WarehouseHostGeometry.Insets safe) {
        return state.updateHost(active, owner, width, height, safe.top, safe.right, safe.bottom, safe.left);
    }
    boolean isReady() { return revealed; }
    void resume() {
        if (destroyed) return;
        state.resume(SystemClock.uptimeMillis());
        main.removeCallbacks(watchdog);
        if (state.isWaiting()) main.postDelayed(watchdog, state.remaining(SystemClock.uptimeMillis()));
    }
    void pause() { state.pause(SystemClock.uptimeMillis());main.removeCallbacks(watchdog); }
    void destroy() {
        destroyed = true;revealed = false;state.destroy();main.removeCallbacksAndMessages(null);
        if (webView != null) { webView.removeJavascriptInterface("WarehouseLaunch");webView.setOnTouchListener(null); }
        removeOverlay();hostState = null;webView = null;
    }
    private boolean visibleWebView() {
        return webView != null && webView.isAttachedToWindow() && webView.getVisibility() == View.VISIBLE && webView.getWindowVisibility() == View.VISIBLE;
    }
    private void requestFrame(String serialized) {
        if (destroyed || !state.isWaiting() || !visibleWebView() || hostState == null) return;
        // Refresh physical native state before comparing JS's snapshot, including generations.
        hostState.get();
        final WarehouseLaunchState.Snapshot expected;
        try { expected = decode(new JSONObject(serialized)); } catch (JSONException | IllegalArgumentException malformed) { return; }
        final long request = state.requestFrame(expected);
        if (request == 0) return;
        try {
            webView.postVisualStateCallback(request, new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) {
                    if (destroyed || hostState == null) return;
                    hostState.get();
                    if (!visibleWebView()) { state.cancelVisual(requestId);return; }
                    // Android guarantees the next draw contains the Canvas state submitted
                    // before postVisualStateCallback. Removing this overlay joins that draw.
                    if (state.visualReady(requestId)) {
                        main.removeCallbacks(watchdog);removeOverlay();revealed = true;
                    }
                }
            });
        } catch (RuntimeException unavailable) {
            state.cancelVisual(request); // Detached/transient WebView can retry a later real frame.
        }
    }
    private void showFailure(String message) {
        if (destroyed) return;
        main.removeCallbacks(watchdog);
        if (failureView == null) {
            failureView = new TextView(activity);
            failureView.setBackgroundColor(BACKGROUND);failureView.setTextColor(Color.rgb(233, 237, 242));
            failureView.setTextSize(18);failureView.setGravity(Gravity.CENTER);
            int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
            failureView.setPadding(padding, padding, padding, padding);
            failureView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
            failureView.setText(message);
            activity.addContentView(failureView, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        // Install the opaque native error surface first, even if the renderer never started.
        removeOverlay();
    }
    private void removeOverlay() { if (overlay != null) { overlay.remove();overlay = null; } }
    private static int integer(JSONObject json, String key) throws JSONException {
        Object value = json.get(key);
        if (!(value instanceof Number)) throw new JSONException("Invalid frame geometry");
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || number < 0 || number > Integer.MAX_VALUE || number != Math.floor(number)) throw new JSONException("Invalid frame geometry");
        return (int) number;
    }
    private static WarehouseLaunchState.Snapshot decode(JSONObject json) throws JSONException {
        JSONObject safe = json.getJSONObject("insetsPx");
        Object active = json.get("active"), owner = json.get("owner");
        if (!(active instanceof Boolean) || !(owner instanceof Boolean)) throw new JSONException("Invalid host lifecycle");
        return new WarehouseLaunchState.Snapshot(integer(json, "launchGeneration"), (Boolean) active, (Boolean) owner,
            integer(json, "widthPx"), integer(json, "heightPx"), integer(safe, "top"), integer(safe, "right"), integer(safe, "bottom"), integer(safe, "left"));
    }
    /** No storage, navigation or arbitrary native execution. Inputs are bounded plain data. */
    public final class LaunchBridge {
        @JavascriptInterface public void frameReady(String serialized) {
            if (serialized == null || serialized.length() > 2048) return;
            main.post(() -> requestFrame(serialized));
        }
        @JavascriptInterface public boolean isReady() { return revealed; }
        @JavascriptInterface public void failed(String message) {
            final String text = message == null || message.trim().isEmpty() ? FAILURE : message.substring(0, Math.min(message.length(), 1024));
            main.post(() -> { if (!destroyed && state.failed()) showFailure(text); });
        }
    }
}
