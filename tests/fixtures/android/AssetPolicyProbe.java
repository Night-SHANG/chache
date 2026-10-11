package io.github.nightshang.chache;

/** Executes the real production policy without Android API stubs or mocks. */
public final class AssetPolicyProbe {
    public static void main(String[] args) {
        String[] allowed = {"https://localhost/", "https://localhost/app.js", "https://localhost/assets/cargo-materials.png?x=1"};
        String[] denied = {
            "http://localhost/app.js", "https://example.com/app.js", "file:///data/private.txt",
            "https://localhost:443/app.js", "https://localhost:8443/app.js", "https://user@localhost/app.js",
            "https://localhost/_capacitor_file_/data/private.txt", "https://localhost/_capacitor_content_/private",
            "https://localhost/%5Fcapacitor%5Ffile%5F/data/private.txt", "https://localhost/assets/%2e%2e/private.txt",
            "https://localhost/%2F_capacitor_file_/private", "not a URL"
        };
        for (String url : allowed) if (!BundledAssetPolicy.isAllowed(url)) throw new AssertionError("Rejected bundled URL: " + url);
        for (String url : denied) if (BundledAssetPolicy.isAllowed(url)) throw new AssertionError("Allowed forbidden URL: " + url);
        System.out.println("15 asset policy probes passed");
    }
}
