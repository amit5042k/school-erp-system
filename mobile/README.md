# School ERP — Android and iOS apps

One app for staff, students and parents, on Android and iPhone/iPad. It opens the hosted School ERP (same screens and
logins as the website) and adds:

- a phone-first **Home** screen for each role (`/home`),
- **push notifications** (absent today, fee received, results published, homework/diary, notices, leave decisions,
  bus alerts…),
- **Print** (system print dialog) and **file downloads** (Excel/PDF saved or shared),
- an **offline screen** with "Try again", the Android back button, and Meet/Zoom links and files opening outside.

Every feature added to the website appears in the apps automatically; no app update is needed.

## 1. Point the app at your school

Edit `app.config.json` (or set the GitHub variables `ERP_URL` / `API_URL`):

| Key | Example | Notes |
| --- | --- | --- |
| `erpUrl` | `https://nextgenos.in` | The website address. Must be https. |
| `apiUrl` | `https://nextgenos.in` | The server address; the same as `erpUrl` when the site runs as one app. |
| `appId` | `in.yourschool.erp` | Store id (Android package / iOS bundle id). **Can't change after the first upload.** |
| `appName` | `DPS ERP` | Name under the icon. |
| `versionName` / `versionCode` | `1.0.0` / `1` | `versionCode` (build number) must increase with every store upload. |

For your school's logo, replace `assets/logo.svg` and run `npm run icons` (Android icons and splash, iOS icon and splash).
If you change `appId`, also change `PRODUCT_BUNDLE_IDENTIFIER` in `ios/App/App.xcodeproj` (or set it in Xcode).

## 2. Build the apps (GitHub Actions, nothing to install)

**Actions → Android app → Run workflow** gives `app-debug.apk` (install on any phone to test), plus a signed
`app-release.apk` and `app-release.aab` once the signing secrets in step 4 are set.

**Actions → iOS app → Run workflow** builds on a Mac runner. It always gives `SchoolERP-simulator.app.zip` (proves the
app compiles; runs on the iOS Simulator). With the Apple secrets in step 5 it also gives a signed `.ipa` and can upload it
to TestFlight.

Both run automatically when anything in `mobile/` changes.

On your own computer: Android needs Node 20+, JDK 21 and the Android SDK (`npm install && npm run build:debug`);
iOS needs a Mac with Xcode 16+ (`npm install && npm run sync:ios`, then open `ios/App/App.xcodeproj`).

## 3. Push notifications

### Android (Firebase, free)
1. <https://console.firebase.google.com> → **Add project** → **Add app → Android**, package name = your `appId`.
   Download **google-services.json** and add it as the GitHub secret `GOOGLE_SERVICES_JSON_BASE64`
   (`base64 -w0 google-services.json`). Local builds: put it at `android/app/google-services.json`.
2. **Project settings → Service accounts → Generate new private key.** Copy the file to the server and add to
   `backend/.env` (or the host's environment variables): `FCM_SERVICE_ACCOUNT_FILE=./firebase-service-account.json`.

### iOS (Apple Push Notification service)
1. developer.apple.com → **Certificates, IDs & Profiles → Identifiers**: register your `appId` and tick **Push Notifications**.
2. **Keys → +**, tick **Apple Push Notifications service (APNs)**, download the `.p8` file (only once!) and note its Key ID.
3. On the server set: `APNS_KEY_FILE=./AuthKey_XXXXXXXXXX.p8`, `APNS_KEY_ID=XXXXXXXXXX`, `APNS_TEAM_ID=<your Team ID>`,
   `APNS_BUNDLE_ID=<your appId>`. (Use `APNS_SANDBOX=true` only for apps run from Xcode.)

Restart the server, then check `/api/push/status`: `"apps": {"android": true, "ios": true}`. People are asked to allow
notifications at first sign-in. Without these settings, notifications still appear on the app's Notifications page.

## 4. Android: sign and publish on Google Play

Create a signing key **once** and keep it safe (losing it means you can never update the app):

```bash
keytool -genkeypair -v -keystore release.jks -alias schoolerp -keyalg RSA -keysize 2048 -validity 10000
```

GitHub secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Then in <https://play.google.com/console> (one-time fee): create the app,
store listing (screenshots, the 512×512 icon `frontend/public/icons/icon-512.png`), privacy policy URL, data-safety form,
target audience, and a demo login for reviewers. Upload `app-release.aab` to **Internal testing**, try it on staff phones,
then promote to **Production**.

## 5. iOS: sign and publish on the App Store

Needs an Apple Developer Program membership (paid yearly), in the school's or your company's name.

1. **Certificate:** in Keychain Access on a Mac (or via the Apple Developer site) create an **Apple Distribution**
   certificate; export it with its private key as a `.p12` with a password.
2. **Provisioning profile:** developer.apple.com → Profiles → **App Store Connect** profile for your `appId`; download it.
3. GitHub secrets: `IOS_CERT_P12_BASE64` (`base64 -i cert.p12`), `IOS_CERT_PASSWORD`, `IOS_PROFILE_BASE64`
   (`base64 -i profile.mobileprovision`). Optional variable `IOS_TEAM_ID` (read from the profile otherwise).
4. To upload to TestFlight automatically: App Store Connect → Users and Access → Integrations → **App Store Connect API**
   key (App Manager role); secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`.
5. App Store Connect → **My Apps → +** with the same bundle id. Fill in the listing, privacy policy URL, App Privacy
   answers (names, phone numbers, academic records; linked to the user; not used for tracking), the age rating, and a
   **demo login** in App Review Information. Run the iOS workflow, test the build in **TestFlight**, then submit for review.

Apple reviews apps that mostly show a website closely: the app has native push, printing, file sharing and an offline
screen, and every user signs in to their school's account; say so in the review notes.

## Notes and limits

- The apps show the live website, so they need internet. Without a connection they show the offline screen.
- The Android app targets Android 16 (API 36) and runs on Android 7.0+; the iOS app runs on iOS 15+.
- Bus drivers sharing their location must keep the app open on screen during the trip.
