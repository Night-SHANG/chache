package io.github.nightshang.chache;

import static org.junit.Assert.*;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import io.github.nightshang.chache.storage.WarehouseStore;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real WebView/Activity checks. Fixtures are instrumentation-only, never bundled game APIs. */
@RunWith(AndroidJUnit4.class)
public class HostSecurityTest {
    private static String evaluate(WebView view, String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> view.evaluateJavascript(script, value -> {
            result.set(value); latch.countDown();
        }));
        assertTrue("WebView evaluation timed out", latch.await(10, TimeUnit.SECONDS));
        Object decoded = new JSONTokener(result.get()).nextValue();
        return decoded == JSONObject.NULL ? null : String.valueOf(decoded);
    }
    private static MainActivity activity(ActivityScenario<MainActivity> scenario) {
        AtomicReference<MainActivity> result = new AtomicReference<>();scenario.onActivity(result::set);return result.get();
    }
    private static WarehouseHostPlugin host(MainActivity activity) {
        return (WarehouseHostPlugin) activity.getBridge().getPlugin("WarehouseHost").getInstance();
    }
    private static WarehouseStore store(WarehouseHostPlugin host) throws Exception {
        Field field = WarehouseHostPlugin.class.getDeclaredField("store");field.setAccessible(true);return (WarehouseStore) field.get(host);
    }
    private static void awaitStartup(WebView view) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (System.nanoTime() < end) {
            if ("ready".equals(evaluate(view,"typeof window.WarehouseLaunch?.isReady === 'function' && WarehouseLaunch.isReady() && document.querySelector('#startup-status')?.hidden === true ? 'ready' : 'waiting'"))) return;
            Thread.sleep(100);
        }
        fail("Bundled production entry did not pass native startup: " + evaluate(view,"document.querySelector('#startup-status')?.textContent"));
    }
    @Test public void preNavigationBridgeStartsTheBundledProductionEntry() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            MainActivity activity = activity(scenario);WebView view = activity.getBridge().getWebView();awaitStartup(view);
            assertEquals("https://localhost",evaluate(view,"location.origin"));
            assertEquals("function",evaluate(view,"typeof WarehouseStorage.get"));
            assertEquals("function",evaluate(view,"typeof WarehouseLaunch.frameReady"));
            assertEquals("function",evaluate(view,"typeof WarehouseLaunch.failed"));
            assertEquals("true",evaluate(view,"WarehouseLaunch.isReady()"));
            Field launchField = MainActivity.class.getDeclaredField("launch");launchField.setAccessible(true);
            Object launch = launchField.get(activity);
            Field overlayField = WarehouseLaunchHandoff.class.getDeclaredField("overlay");overlayField.setAccessible(true);
            scenario.onActivity(current -> {
                assertTrue(current.launchReady());
                try { assertNull("Splash overlay must be removed only after native visual completion", overlayField.get(launch)); }
                catch (IllegalAccessException failure) { throw new AssertionError(failure); }
            });
            assertEquals("undefined",evaluate(view,"typeof window.__WAREHOUSE__"));
            assertTrue(store(host(activity)).ownsHost());
            assertEquals("true",evaluate(view,"JSON.parse(WarehouseStorage.listKeys('warehouse.')).ok"));
            scenario.onActivity(current -> {
                assertFalse(view.getSettings().getAllowFileAccess());assertFalse(view.getSettings().getAllowContentAccess());
                assertFalse(view.getSettings().getJavaScriptCanOpenWindowsAutomatically());assertFalse(view.getSettings().supportMultipleWindows());
                assertTrue(current.getBridge().getWebViewClient() instanceof OfflineWebViewClient);
            });
        }
    }
    @Test public void foreignNavigationAndPopupCannotLoadAFrameWithTheBridge() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView view = activity(scenario).getBridge().getWebView();awaitStartup(view);
            evaluate(view,"location.href='https://example.invalid/untrusted'; 'attempted'");Thread.sleep(300);
            assertEquals("https://localhost",evaluate(view,"location.origin"));
            evaluate(view,"location.href='file:///sdcard/untrusted.html'; 'attempted'");Thread.sleep(300);
            assertEquals("https://localhost",evaluate(view,"location.origin"));
            assertEquals("null",evaluate(view,"String(window.open('https://example.invalid/popup'))"));
        }
    }
    @Test public void iframeLocalRemoteAndSrcdocAreBlockedByTheBundledCsp() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView view = activity(scenario).getBridge().getWebView();awaitStartup(view);
            evaluate(view,"window.__hostSecurityViolations=[]; document.addEventListener('securitypolicyviolation',e=>window.__hostSecurityViolations.push(e.violatedDirective)); ['https://example.invalid/frame','https://localhost/index.html'].forEach(src=>{const f=document.createElement('iframe');f.src=src;document.body.appendChild(f)}); const f=document.createElement('iframe');f.srcdoc='<script>parent.__untrustedBridgeExecuted=typeof WarehouseStorage;<\\/script>';document.body.appendChild(f); 'attempted'");
            Thread.sleep(500);
            assertEquals("undefined",evaluate(view,"typeof window.__untrustedBridgeExecuted"));
            assertEquals("true",evaluate(view,"window.__hostSecurityViolations.filter(x=>x==='frame-src').length >= 3"));
            evaluate(view,"document.querySelectorAll('iframe').forEach(f=>f.remove()); delete window.__hostSecurityViolations; 'cleaned'");
        }
    }
    @Test public void recreationRevokesOldHostAndLateDestroyCannotClearSuccessor() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            MainActivity before = activity(scenario);awaitStartup(before.getBridge().getWebView());WarehouseHostPlugin old = host(before);WarehouseStore oldStore = store(old);
            scenario.recreate();MainActivity after = activity(scenario);awaitStartup(after.getBridge().getWebView());WarehouseHostPlugin successor = host(after);WarehouseStore current = store(successor);
            assertNotSame(old,successor);assertFalse(oldStore.ownsHost());assertTrue(current.ownsHost());
            scenario.onActivity(ignored -> old.handleOnDestroy());
            Field field = WarehouseHostPlugin.class.getDeclaredField("currentHost");field.setAccessible(true);assertSame(successor,field.get(null));assertTrue(current.ownsHost());
            Method state = WarehouseHostPlugin.class.getDeclaredMethod("state");state.setAccessible(true);AtomicReference<JSONObject> snapshot = new AtomicReference<>();
            scenario.onActivity(ignored -> {try {snapshot.set((JSONObject)state.invoke(successor));}catch(Exception failure){throw new AssertionError(failure);}});
            assertTrue("Recreated host publishes a fresh launch generation", snapshot.get().getLong("launchGeneration") > 0);
            assertTrue(after.launchReady());
            assertTrue(snapshot.get().getBoolean("owner"));assertTrue(snapshot.get().getBoolean("active"));assertEquals("function",evaluate(after.getBridge().getWebView(),"typeof WarehouseStorage.get"));
        }
    }
}
