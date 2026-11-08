# iOS GitHub Actions

This repository now includes a manual GitHub Actions workflow for building the Capacitor iOS app on GitHub-hosted macOS runners and, optionally, uploading the generated IPA to App Store Connect.

Workflow file:

- `.github/workflows/ios-app-store.yml`

Shared Xcode scheme added for CI:

- `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`

## What the workflow does

When you run the workflow manually from the GitHub Actions tab, it will:

1. Install Node dependencies with `npm ci`
2. Build the web app
3. Run `npx cap sync ios`
4. Import the Apple signing certificate and provisioning profile
5. Archive the iOS app with `xcodebuild`
6. Export an IPA
7. Upload the IPA as a GitHub Actions artifact
8. Optionally upload the IPA to App Store Connect

## Required repository secrets

Create these secrets in GitHub:

- `APPLE_TEAM_ID`
- `BUILD_CERTIFICATE_BASE64`
- `P12_PASSWORD`
- `BUILD_PROVISION_PROFILE_BASE64`
- `KEYCHAIN_PASSWORD`

These three are only required if you choose `upload_to_app_store = true` when launching the workflow:

- `APP_STORE_CONNECT_USERNAME`
- `APP_STORE_CONNECT_APP_PASSWORD`
- `APP_STORE_CONNECT_PROVIDER_PUBLIC_ID` (optional)

## How to prepare the secrets

You do not need a local Mac for this workflow. You still need:

- An active Apple Developer Program membership.
- The app created in App Store Connect with bundle ID `com.validele.app`.
- A cloud macOS builder, here GitHub Actions `macos-15`.
- Apple signing assets: an Apple Distribution certificate and an App Store provisioning profile.

The signing assets can be prepared from Windows by generating a private key and CSR with OpenSSL, creating the certificate/profile in the Apple Developer portal, then converting them to Base64 for GitHub secrets.

### 0. Create a CSR on Windows

Install OpenSSL for Windows if needed, then run:

```powershell
openssl genrsa -out ios_distribution.key 2048
openssl req -new -key ios_distribution.key -out ios_distribution.csr -subj "/emailAddress=YOUR_APPLE_ID_EMAIL,CN=Validel iOS Distribution,C=SN"
```

In the Apple Developer portal:

1. Open **Certificates, Identifiers & Profiles**.
2. Create an **Apple Distribution** certificate.
3. Upload `ios_distribution.csr`.
4. Download the generated `.cer` certificate.

Convert the downloaded certificate and private key into a `.p12` file:

```powershell
openssl x509 -inform DER -in distribution.cer -out distribution.pem
openssl pkcs12 -export -inkey ios_distribution.key -in distribution.pem -out distribution.p12
```

Use the password you chose during export as `P12_PASSWORD`.

### 1. Export your signing certificate

Use the `distribution.p12` file created above. If you do have access to a Mac, you can also export your Apple Distribution certificate as a `.p12` file from Keychain Access or Xcode.

Then convert it to Base64.

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\distribution.p12"))
```

Copy the output into the `BUILD_CERTIFICATE_BASE64` GitHub secret.

Store the `.p12` password in `P12_PASSWORD`.

### 2. Export your provisioning profile

In the Apple Developer portal:

1. Create or confirm the app identifier `com.validele.app`.
2. Create an **App Store** provisioning profile for that identifier.
3. Select the Apple Distribution certificate created from your CSR.
4. Download the `.mobileprovision` file.

Then convert it to Base64.

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\profile.mobileprovision"))
```

Copy the output into the `BUILD_PROVISION_PROFILE_BASE64` GitHub secret.

### 3. Create a temporary keychain password

Create any strong random password and save it as:

- `KEYCHAIN_PASSWORD`

This is only used inside the GitHub Actions macOS runner.

### 4. Create upload secrets for App Store Connect

If you want the workflow to upload directly after export:

- store your Apple developer login email in `APP_STORE_CONNECT_USERNAME`
- store your app-specific password in `APP_STORE_CONNECT_APP_PASSWORD`

If your Apple account is linked to multiple providers, also add:

- `APP_STORE_CONNECT_PROVIDER_PUBLIC_ID`

## How to run the workflow

1. Push your changes to GitHub
2. Open the `Actions` tab
3. Open `iOS App Store`
4. Click `Run workflow`
5. Choose:

- `false` to only build and get the IPA artifact
- `true` to build and upload to App Store Connect

## Notes

- The workflow is configured for:
  - Xcode project: `ios/App/App.xcodeproj`
  - scheme: `App`
  - bundle identifier: `com.validele.app`
- If you change the bundle identifier later, update the `IOS_BUNDLE_IDENTIFIER` value in the workflow file.
- The first useful run is usually `upload_to_app_store = false` to validate signing and IPA export before attempting upload.
