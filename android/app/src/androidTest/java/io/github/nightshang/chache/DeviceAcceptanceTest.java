package io.github.nightshang.chache;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import io.github.nightshang.chache.storage.WarehouseStorageBridge;
import io.github.nightshang.chache.storage.WarehouseStore;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Driver-only test APK: the product has no acceptance assets, controls or fixture entry point. */
@RunWith(AndroidJUnit4.class)
public class DeviceAcceptanceTest {
    private final CountDownLatch completed = new CountDownLatch(1);
    private volatile JSONObject result;
    private volatile Throwable failure;
    private volatile long maxMainLooperDelayMs;
    private volatile boolean sampling;
    private volatile String userAgent;
    private Context target;
    private String action;
    private String phase;
    private String nonce;

    @Test public void runAcceptanceAction() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        action = args.getString("acceptanceAction");
        assumeTrue("Requires the explicit disposable-emulator acceptance driver", action != null);
        assertEquals("Fixture reset requires explicit disposable-emulator opt-in", "true", args.getString("disposableEmulator"));
        phase = args.getString("acceptancePhase", "");
        nonce = args.getString("acceptanceNonce", "");
        assertTrue("A unique invocation nonce is required", nonce.matches("[a-zA-Z0-9_.:-]{8,100}"));
        target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("io.github.nightshang.chache", target.getPackageName());
        // No Activity is launched, so there is only one real native database owner.
        try (WarehouseStore store = new WarehouseStore(target)) {
            String script;
            try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("acceptance.js")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();byte[] buffer = new byte[8192];int read;
                while ((read = input.read(buffer)) != -1) bytes.write(buffer, 0, read);
                script = bytes.toString("UTF-8");
            }
            JSONObject command = new JSONObject().put("action", action).put("phase", phase);
            String html = "<!doctype html><meta charset='utf-8'><script>const __ANDROID_ACCEPTANCE_COMMAND__="
                + command + ";</script><script>" + script.replace("</script", "<\\/script") + "</script>";
            WebView[] view = new WebView[1];
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                WebView web = new WebView(target);view[0] = web;
                userAgent = web.getSettings().getUserAgentString();
                web.getSettings().setJavaScriptEnabled(true);
                web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);
                web.getSettings().setBlockNetworkLoads(true);
                web.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
                    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                        return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                    }
                });
                web.addJavascriptInterface(new WarehouseStorageBridge(store), "WarehouseAcceptanceStorage");
                web.addJavascriptInterface(new Control(), "WarehouseAcceptanceControl");
                startMainLooperSampling();
                web.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            });
            try {
                assertTrue("Acceptance timed out; incomplete evidence cannot pass", completed.await(24, TimeUnit.MINUTES));
                if (failure != null) throw new AssertionError("Acceptance report failed", failure);
                assertEquals("Native/WebView acceptance result: " + result, "passed", result.getString("status"));
                assertTrue("Main looper delayed more than 500ms", maxMainLooperDelayMs <= 500);
            } finally {
                sampling = false;
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> view[0].destroy());
            }
        }
    }

    private void startMainLooperSampling() {
        sampling = true;
        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(new Runnable() {
            private long expected = SystemClock.uptimeMillis() + 16;
            @Override public void run() {
                maxMainLooperDelayMs = Math.max(maxMainLooperDelayMs, Math.max(0, SystemClock.uptimeMillis() - expected));
                expected = SystemClock.uptimeMillis() + 16;
                if (sampling) handler.postDelayed(this, 16);
            }
        }, 16);
    }

    private JSONObject envelope(String status) throws Exception {
        return new JSONObject().put("schema", 1).put("action", action).put("phase", phase).put("nonce", nonce)
            .put("status", status).put("pid", Process.myPid()).put("maxMainLooperDelayMs", maxMainLooperDelayMs)
            .put("webViewUserAgent", userAgent).put("frameTiming", "not-measured")
            .put("mainLooperMeasurement", "Handler scheduling delay; not frame timing or an ANR detector");
    }
    private void write(String name, JSONObject value) throws Exception {
        try (FileOutputStream output = target.openFileOutput(name, Context.MODE_PRIVATE)) {
            output.write(value.toString().getBytes(StandardCharsets.UTF_8));output.getFD().sync();
        }
    }
    public final class Control {
        @JavascriptInterface public void checkpoint(String reached) {
            try {
                if (!"seed-crash".equals(action) || !phase.equals(reached)) throw new IllegalStateException("Unexpected checkpoint");
                write("android-acceptance-checkpoint.json", envelope("checkpoint").put("reached", reached));
                // The adb driver force-stops this actual target process. Never emulate death with an exception.
                new CountDownLatch(1).await();
            } catch (Exception error) { failure = error;completed.countDown(); }
        }
        @JavascriptInterface public void complete(String raw) {
            try {
                result = new JSONObject(raw);
                String status = result.getString("status");
                if (maxMainLooperDelayMs > 500) status = "failed";
                write("android-acceptance-result.json", envelope(status).put("result", result));
            } catch (Exception error) { failure = error; }
            finally { completed.countDown(); }
        }
    }
}
