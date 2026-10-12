package io.github.nightshang.chache;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real Android callbacks, plugin dispatch, asset serving and CSP; pending device CI. */
@RunWith(AndroidJUnit4.class)
public class ShellBoundaryInstrumentedTest {
    @Test(timeout = 45000)
    public void initialLoadRejectsServerRootMutationAndPrivateFileReads() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        File marker = new File(context.getFilesDir(), "shell-probe-" + UUID.randomUUID() + ".txt");
        String privateBytes = "app-private-shell-marker-" + UUID.randomUUID();
        try (FileOutputStream output = new FileOutputStream(marker)) {
            output.write(privateBytes.getBytes(StandardCharsets.UTF_8));
        }
        SharedPreferences prefs = context.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE);
        String oldPath = prefs.getString("serverBasePath", null);
        String oldCode = prefs.getString("lastBinaryVersionCode", null);
        String oldName = prefs.getString("lastBinaryVersionName", null);
        assertTrue(prefs.edit().putString("serverBasePath", marker.getParent())
            .putString("lastBinaryVersionCode", "1").putString("lastBinaryVersionName", "1.0.11").commit());
        MainActivity activity = null;
        try {
            activity = (MainActivity) instrumentation.startActivitySync(
                new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            MainActivity launched = activity;
            Bridge bridge = activity.getBridge();
            assertEquals(FixedAssetWebViewPlugin.class, bridge.getPlugin("WebView").getPluginClass());
            assertEquals("public", bridge.getServerBasePath());
            assertEquals("disable", bridge.getConfig().getPluginConfiguration("SystemBars").getString("insetsHandling", "css"));
            Object bars = bridge.getPlugin("SystemBars").getInstance();
            Field handling = bars.getClass().getDeclaredField("insetsHandling");
            handling.setAccessible(true);
            assertEquals("disable", handling.get(bars));
            Field listener = bars.getClass().getDeclaredField("webViewListener");
            listener.setAccessible(true);
            assertNull("SystemBars must not own another Insets listener", listener.get(bars));
            assertFalse(bridge.getConfig().isResolveServiceWorkerRequests());
            waitForJavascript(instrumentation, launched, "Boolean(window.Capacitor && window.Capacitor.nativePromise)");
            String path = JSONObject.quote(marker.getParent());
            String file = JSONObject.quote(marker.getName());
            evaluate(instrumentation, launched, "(async()=>{const attempts=[];"
                + "for(const method of ['setServerBasePath','setServerAssetPath','persistServerBasePath']){"
                + "try{await Capacitor.nativePromise('WebView',method,{path:" + path + "});attempts.push('RESOLVED')}"
                + "catch(error){attempts.push(error.code)}}"
                + "const response=await fetch('/'+" + file + ");const body=await response.text();"
                + "let workerError='RESOLVED';try{new Worker(URL.createObjectURL(new Blob(['self.postMessage(1)'],{type:'text/javascript'})))}catch(error){workerError=error.name}"
                + "let serviceWorkerError='RESOLVED';try{await navigator.serviceWorker.register('/app.js')}catch(error){serviceWorkerError=error.name}"
                + "window.__shellBoundaryProbe={attempts,body,workerError,serviceWorkerError};"
                + "})().catch(error=>{window.__shellBoundaryProbe={fatal:String(error)}})");
            JSONObject probe = waitForProbe(instrumentation, launched);
            assertFalse(probe.has("fatal"));
            for (int i = 0; i < 3; i++) assertEquals("ASSET_ROOT_IMMUTABLE", probe.getJSONArray("attempts").getString(i));
            assertFalse("A normal localhost path must not serve an app-private file", probe.getString("body").contains(privateBytes));
            assertEquals("SecurityError", probe.getString("workerError"));
            assertEquals("SecurityError", probe.getString("serviceWorkerError"));
            assertEquals("public", bridge.getServerBasePath());
            assertEquals("Rejected persistence must not mutate preferences", marker.getParent(), prefs.getString("serverBasePath", null));
            for (String url : new String[]{
                "https://localhost/_capacitor_file_" + marker.getAbsolutePath(),
                "https://localhost/%5Fcapacitor%5Ffile%5F" + marker.getAbsolutePath(),
                "https://localhost/_capacitor_content_/private", "https://localhost:8443/app.js"
            }) {
                WebResourceResponse response = bridge.getWebViewClient().shouldInterceptRequest(bridge.getWebView(), new Request(url));
                assertEquals(url, 403, response.getStatusCode());
                assertEquals(-1, response.getData().read());
            }
        } finally {
            if (activity != null) {
                MainActivity launched = activity;
                instrumentation.runOnMainSync(launched::finish);
            }
            SharedPreferences.Editor restore = prefs.edit();
            restore(restore, "serverBasePath", oldPath);
            restore(restore, "lastBinaryVersionCode", oldCode);
            restore(restore, "lastBinaryVersionName", oldName);
            assertTrue(restore.commit());
            assertTrue(marker.delete());
        }
    }

    @Test
    public void workerCallbackNeverDelegatesToNativeAssetOrFileServer() throws Exception {
        AtomicReference<boolean[]> settings = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            OfflineServiceWorkerClient.install();
            settings.set(new boolean[]{
                WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE),
                ServiceWorkerController.getInstance().getServiceWorkerWebSettings().getBlockNetworkLoads(),
                ServiceWorkerController.getInstance().getServiceWorkerWebSettings().getAllowFileAccess(),
                ServiceWorkerController.getInstance().getServiceWorkerWebSettings().getAllowContentAccess()
            });
        });
        assertTrue("The CI device must exercise worker callback support", settings.get()[0]);
        assertTrue(settings.get()[1]);
        assertFalse(settings.get()[2]);
        assertFalse(settings.get()[3]);
        OfflineServiceWorkerClient client = new OfflineServiceWorkerClient();
        for (String url : new String[]{"https://localhost/app.js", "https://localhost/_capacitor_file_/data/private.txt", "https://localhost/_capacitor_content_/private", "https://example.com/app.js"}) {
            WebResourceResponse response = client.shouldInterceptRequest(new Request(url));
            assertEquals(url, 403, response.getStatusCode());
            assertEquals(-1, response.getData().read());
        }
    }

    private static void restore(SharedPreferences.Editor editor, String key, String value) {
        if (value == null) editor.remove(key); else editor.putString(key, value);
    }

    private static String evaluate(Instrumentation instrumentation, MainActivity activity, String script) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            completed.countDown();
        }));
        assertTrue("JavaScript callback timed out", completed.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private static void waitForJavascript(Instrumentation instrumentation, MainActivity activity, String script) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        do {
            if ("true".equals(evaluate(instrumentation, activity, script))) return;
            Thread.sleep(25);
        } while (System.nanoTime() < until);
        fail("Native bridge never became available on initial asset load");
    }

    private static JSONObject waitForProbe(Instrumentation instrumentation, MainActivity activity) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        do {
            Object value = new JSONTokener(evaluate(instrumentation, activity, "JSON.stringify(window.__shellBoundaryProbe||null)")).nextValue();
            if (value instanceof String && !"null".equals(value)) return new JSONObject((String) value);
            Thread.sleep(25);
        } while (System.nanoTime() < until);
        throw new AssertionError("Shell boundary probe did not finish");
    }

    private static final class Request implements WebResourceRequest {
        private final Uri uri;
        Request(String url) { uri = Uri.parse(url); }
        @Override public Uri getUrl() { return uri; }
        @Override public boolean isForMainFrame() { return true; }
        @Override public boolean isRedirect() { return false; }
        @Override public boolean hasGesture() { return false; }
        @Override public String getMethod() { return "GET"; }
        @Override public Map<String, String> getRequestHeaders() { return Collections.emptyMap(); }
    }
}
