package io.github.nightshang.chache;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import java.util.function.Supplier;
import org.json.JSONObject;
import com.getcapacitor.ServerPath;

public class MainActivity extends BridgeActivity {
    private WarehouseLaunchHandoff launch;

    @Override protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        launch = new WarehouseLaunchHandoff(this);
        super.onCreate(savedInstanceState);
        // Register after the content View exists on API 24–30, but before its first draw.
        splash.setOnExitAnimationListener(launch::onSplashExit);
    }
    void attachLaunchWebView(WebView view, Supplier<JSONObject> snapshot) { launch.attachWebView(view, snapshot); }
    long launchGeneration(boolean active, boolean owner, int width, int height, WarehouseHostGeometry.Insets safe) {
        return launch.updateHost(active, owner, width, height, safe);
    }
    boolean launchReady() { return launch != null && launch.isReady(); }
    void pauseLaunchForBackground() { if (launch != null && !launch.isReady()) launch.pause(); }
    void resumeLaunchAfterBackgroundFailure() {
        if (launch != null && !launch.isReady()) {
            launch.resume();
            if (getBridge() != null && getBridge().getPlugin("WarehouseHost") != null)
                ((WarehouseHostPlugin) getBridge().getPlugin("WarehouseHost").getInstance()).publishLaunchState();
        }
    }
    void restoreImmersiveAfterSplash() {
        if (getBridge() == null || getBridge().getPlugin("WarehouseHost") == null) return;
        ((WarehouseHostPlugin) getBridge().getPlugin("WarehouseHost").getInstance()).restoreImmersiveAfterSplash();
    }
    @Override public void onResume() { if (launch != null) launch.resume();super.onResume(); }
    @Override public void onPause() { if (launch != null) launch.pause();super.onPause(); }
    @Override public void onDestroy() { if (launch != null) launch.destroy();super.onDestroy(); }

    @Override
    protected void load() {
        OfflineServiceWorkerClient.install();
        registerPlugin(FixedAssetWebViewPlugin.class);
        registerPlugin(WarehouseHostPlugin.class);
        // Overrides any legacy deployment root before the first queued page load.
        bridgeBuilder.setServerPath(new ServerPath(ServerPath.PathType.ASSET_PATH, "public"));
        super.load();
    }
}
