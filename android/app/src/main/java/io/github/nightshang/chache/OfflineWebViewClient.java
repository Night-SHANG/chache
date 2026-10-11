package io.github.nightshang.chache;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Keep the bridge attached only to bundled assets at the exact application origin. */
final class OfflineWebViewClient extends BridgeWebViewClient {
    OfflineWebViewClient(Bridge bridge) {
        super(bridge);
    }

    private boolean isBundledAsset(Uri uri) {
        return BundledAssetPolicy.isAllowed(uri.toString());
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // Do not delegate foreign URLs to Capacitor's external-intent launcher.
        return !request.isForMainFrame() || !isBundledAsset(request.getUrl());
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return !isBundledAsset(Uri.parse(url));
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!isBundledAsset(request.getUrl())) {
            return new WebResourceResponse(
                "text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(),
                new ByteArrayInputStream(new byte[0])
            );
        }
        return super.shouldInterceptRequest(view, request);
    }
}
