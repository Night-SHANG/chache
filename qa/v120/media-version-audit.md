# Independent read-only boundary audit

Compared with v1.0.19 commit fd8056f2:

- Both root and android-shell package.json files change only version to 1.0.20.
- Both lockfiles change only top-level version and root package version. Dependency, integrity and resolution fields are identical.
- All 93 source assets are byte-identical. static-art-manifest.ts and resources.json are unchanged.
- Browser, WeChat and Android each contain the same 17 PNG files (1,542,901 bytes) and 14 audio files (1,720,510 bytes), individually SHA-256-identical to v1.0.19.
- Android's +6 dB button gain, playSound implementation and background music levels are unchanged. Dedicated audio tests: 6/6 pass.
- ui_click SHA-256: 64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512
- BGM SHA-256: 63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da
- Final pre-commit WeChat raw directory: 3,982,652 bytes; JavaScript: 680,660 bytes; remaining to 4 MiB: 211,652 bytes. Processed WeChat IDE size: NOT RUN.
