package io.github.nightshang.chache;

import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ServiceWorkerWebSettings;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Workers are unused: reject every request, including already-existing workers. */
final class OfflineServiceWorkerClient extends ServiceWorkerClient {
    static void install() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) return;
        ServiceWorkerController controller = ServiceWorkerController.getInstance();
        ServiceWorkerWebSettings settings = controller.getServiceWorkerWebSettings();
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        controller.setServiceWorkerClient(new OfflineServiceWorkerClient());
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
        return new WebResourceResponse(
            "text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0])
        );
    }
}
