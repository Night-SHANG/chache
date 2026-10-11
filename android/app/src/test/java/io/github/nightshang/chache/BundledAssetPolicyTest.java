package io.github.nightshang.chache;

import static org.junit.Assert.*;
import org.junit.Test;

public class BundledAssetPolicyTest {
    @Test
    public void acceptsOnlyTheBundledHttpsOrigin() {
        assertTrue(BundledAssetPolicy.isAllowed("https://localhost/app.js"));
        assertTrue(BundledAssetPolicy.isAllowed("https://localhost/assets/scene-materials.png?cache=1"));
        for (String url : new String[]{"http://localhost/app.js", "https://example.com/app.js", "file:///data/private.txt", "https://localhost:443/app.js", "https://localhost:8443/app.js", "https://user@localhost/app.js"}) {
            assertFalse(url, BundledAssetPolicy.isAllowed(url));
        }
    }

    @Test
    public void rejectsDecodedNativeFileRoutesAndTraversal() {
        for (String url : new String[]{"https://localhost/_capacitor_file_/data/private.txt", "https://localhost/_capacitor_content_/private", "https://localhost/%5Fcapacitor%5Ffile%5F/private", "https://localhost/assets/%2e%2e/private", "https://localhost/%2F_capacitor_file_/private", "not a URL"}) {
            assertFalse(url, BundledAssetPolicy.isAllowed(url));
        }
        assertFalse(BundledAssetPolicy.isAllowed(null));
    }
}
