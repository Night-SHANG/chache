package io.github.nightshang.chache;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ServerPath;

public class MainActivity extends BridgeActivity {
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
