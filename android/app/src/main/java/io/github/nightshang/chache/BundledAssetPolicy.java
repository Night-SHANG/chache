package io.github.nightshang.chache;

import java.net.URI;

/** Pure policy shared by the native WebView callback and executable Java tests. */
final class BundledAssetPolicy {
    static boolean isAllowed(String url) {
        if (url == null) return false;
        try {
            URI uri = URI.create(url);
            String path = uri.getPath();
            return "https".equals(uri.getScheme())
                && "localhost".equals(uri.getHost())
                && uri.getPort() == -1
                && uri.getUserInfo() == null
                && path != null
                && !path.contains("..")
                && !path.contains("//")
                && !path.contains("\\")
                && !path.startsWith("/_capacitor_");
        } catch (IllegalArgumentException invalidUrl) {
            return false;
        }
    }
}
