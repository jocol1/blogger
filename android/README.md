# Locly Tea for Android

This is a Trusted Web Activity generated with Bubblewrap. The APK creates a normal Android launcher icon and opens `https://locly.lol/tra-da`; gameplay, wallet, chat, and payments still require Internet. A supporting browser such as Chrome is required for the full-screen Trusted Web Activity. If domain verification fails, Android opens a Custom Tab instead.

The release key is **not** in this repository. Place the existing PKCS#12 keystore at `android/keystore/locly-tea.p12` and use its existing alias `locly-tea`. Keep a separate secure backup: future APK updates must use this same key and an increased `appVersionCode` in `twa-manifest.json`. Set `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD` locally, then run `npx @bubblewrap/cli build` from this directory. Never commit the keystore or passwords.

The production site serves `/.well-known/assetlinks.json` with the public SHA-256 certificate fingerprint from this key. Check that it matches `apksigner verify --print-certs app-release-signed.apk` before publishing. Publish the APK as `locly-tea.apk` on a GitHub Release. Back up the wallet code before switching between browser and APK, since browser storage behavior depends on the TWA provider.
