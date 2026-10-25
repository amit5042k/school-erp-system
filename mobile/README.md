# School ERP — Android app

An Android app that opens the hosted School ERP (same screens and logins as the website) and adds:

- a phone-first **Home** screen for each role (`/home`),
- **push notifications** (absent today, fee received, results published, homework/diary, notices, leave decisions),
- an **offline screen** with "Try again", the **back button**, and opening Meet/Zoom links and files in the phone's browser.

Every feature added to the website appears in the app automatically, with no app update needed.

## 1. Point the app at your school

Edit `app.config.json`:

| Key | Example | Notes |
| --- | --- | --- |
| `erpUrl` | `https://erp.yourschool.in` | The website address. Must be https. |
| `apiUrl` | `https://api.yourschool.in` | The backend address (files are opened from here). |
| `appId` | `in.yourschool.erp` | Unique Play Store id. **Cannot be changed after the first upload.** |
| `appName` | `DPS ERP` | Name under the icon. |
| `versionName` / `versionCode` | `1.0.0` / `1` | Increase `versionCode` for every Play Store upload. |

You can also override them with environment variables (`ERP_URL`, `API_URL`, `APP_ID`, `APP_NAME`, `VERSION_NAME`, `VERSION_CODE`).
To use your school's own logo, replace `assets/logo.svg` and run `npm run icons`.

## 2. Build the APK

### Option A: GitHub Actions (no setup on your computer)

1. In the GitHub repository, go to **Settings → Secrets and variables → Actions**.
2. Under **Variables**, add `ERP_URL` and `API_URL`.
3. Go to **Actions → Android app → Run workflow**.
4. When it finishes, download the artifact. It contains `app-debug.apk`, plus a signed `app-release.apk` and `app-release.aab` once you add the signing secrets (step 4).

### Option B: on your computer

Needs Node 20+, JDK 21 and Android Studio (or the Android SDK command-line tools).

```bash
cd mobile
npm install
npm run build:debug          # → android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a phone: copy the APK to the phone and open it (allow "Install unknown apps"), or `adb install app-debug.apk`.

## 3. Turn on push notifications (Firebase, free)

1. Go to <https://console.firebase.google.com> → **Add project** (Analytics not needed).
2. **Add app → Android**. Package name = your `appId`. Download **google-services.json**.
   - Local build: put it at `mobile/android/app/google-services.json`.
   - GitHub Actions: add a secret `GOOGLE_SERVICES_JSON_BASE64` = output of `base64 -w0 google-services.json`.
3. **Project settings → Service accounts → Generate new private key**. This downloads a JSON key for the **server**.
   Copy it to the server (e.g. `backend/firebase-service-account.json`, never commit it) and add to `backend/.env`:
   ```
   FCM_SERVICE_ACCOUNT_FILE=./firebase-service-account.json
   ```
   Restart the backend. Check it at **/api/push/status** (`"configured": true`), then sign in as admin and send yourself a test with `POST /api/push/test`.
4. Rebuild the app. It asks for notification permission the first time someone signs in.

Without Firebase the app still works; notifications appear in the app's **Notifications** page instead of popping up.

## 4. Sign the app for the Play Store

Create a signing key **once** and keep it safe. Losing it means you can never update the app again.

```bash
keytool -genkeypair -v -keystore release.jks -alias schoolerp -keyalg RSA -keysize 2048 -validity 10000
```

- Local: create `mobile/android/keystore.properties` (never commit it):
  ```
  storeFile=/full/path/to/release.jks
  storePassword=...
  keyAlias=schoolerp
  keyPassword=...
  ```
  then run `npm run build:release` → `android/app/build/outputs/bundle/release/app-release.aab`.
- GitHub Actions: add secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## 5. Publish on Google Play

1. Create a developer account at <https://play.google.com/console> (one-time fee).
2. **Create app**, then fill in the store listing: name, short description, screenshots (take them from the app), the 512×512 icon (`frontend/public/icons/icon-512.png`), and a feature graphic.
3. **App content**: privacy policy URL (required, because the app handles student data), data safety form (you collect names, phone numbers and academic records; data is encrypted in transit; users can ask the school to delete it), target audience (the app is used by parents and students; declare it carefully, as a children-directed app has extra rules), and a **demo login** for Google's reviewers.
4. Upload `app-release.aab` to **Internal testing** first, install it on a few staff phones, then promote it to **Production**.

## Notes and limits

- The app shows the live website, so it needs internet. Without a connection it shows the offline screen.
- **Excel downloads and Print** buttons don't work inside the Android web view. Use the website on a computer for those, or open the file links (they open in the phone's browser).
- There's no iPhone build yet. iPhone users can use the website, or add it to their home screen from Safari.
- The app targets Android 16 (API 36) and runs on Android 7.0 and newer.
