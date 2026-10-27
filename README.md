# StegaHide v2

StegaHide v2 is an offline-first graphical mobile app for hiding one image inside another image. It is built with Expo and React Native and provides a simple Hide/Reveal workflow with local processing, automatic payload fitting, live capacity feedback, password-protected hidden images, and customizable output filenames.

## Features

- Hide a secret image inside a carrier image locally on the device.
- Reveal hidden images from StegaHide carrier files.
- Automatic aspect-preserving resizing and JPEG compression when the secret image is too large.
- Live encrypted capacity meter showing payload usage and remaining carrier budget.
- AES password encryption with integrity verification for hidden payloads.
- Password-protected Reveal flow with incorrect-password detection.
- Direct password-based decryption inside the app on the device.
- Custom output filename field for generated hidden and revealed images.
- Save generated images to the device photo library.
- Share generated images through the native share sheet.
- No image uploads or server-side image processing in the default workflow.
- Dark navy, cyan, and orange graphical interface optimized for mobile screens.

## Download the Android APK

The latest installable Android APK is available from the GitHub release page:

[Download StegaHide v2 Android APK](https://github.com/atharv201227/stegahide-mobile-v2/releases)

The APK is built automatically by GitHub Actions from the workflow in `.github/workflows/android-apk.yml`.

## How to use

1. Open the app and select **Hide**.
2. Choose a **Carrier image**. This is the visible image that will be exported.
3. Choose a **Secret image**. This is the image that will be hidden.
4. Enter an encryption password of at least four characters.
5. Review the live capacity meter. If the secret is too large, StegaHide automatically resizes and compresses it while preserving its aspect ratio.
6. Tap **Create hidden image**.
7. Save or share the generated carrier image.
8. To reveal the image, select **Reveal**, choose the generated carrier, enter the same password, choose an output filename, and tap **Reveal hidden image**. Decryption happens directly inside the app.

### Custom filenames

Use the **Output filename** field before creating or revealing an image. StegaHide removes unsafe characters and automatically applies the correct image extension. For example, entering `family-secret` creates a file such as `family-secret-<timestamp>.png` or the original decrypted image format.

## Tech stack

- Expo SDK 54
- React Native 0.81
- Expo Router
- TypeScript
- NativeWind
- `expo-image-picker` for selecting images
- `expo-image-manipulator` for resizing and compression
- `expo-media-library` for saving images
- `expo-sharing` for sharing results
- CryptoJS AES encryption with HMAC integrity verification
- Vitest for unit tests
- GitHub Actions for Android APK builds

## Local development

### Requirements

- Node.js 20 or newer
- pnpm 9.12 or newer
- Expo-compatible development environment

### Install and run

```bash
pnpm install
pnpm dev
```

The Expo web preview runs through the project development server. For a native device or emulator, use the Expo workflow appropriate for your environment.

### Quality checks

```bash
pnpm test
pnpm check
pnpm lint
npx expo export --platform web
```

## Android APK builds

Push a version tag beginning with `v` to trigger the GitHub Actions build workflow:

```bash
git tag -a v2.0.0 -m "StegaHide v2 Android APK 2.0.0"
git push origin v2.0.0
```

The workflow generates the Android project, builds the release APK, uploads it as a workflow artifact, and publishes it to a GitHub release. Manual builds can also be started from the **Actions** tab using `workflow_dispatch`.

## Security notes

StegaHide is designed for local image processing. Password-protected payloads use AES encryption and an integrity checksum so incorrect passwords or modified encrypted data fail validation. Keep your password safe: it is not stored or recoverable by the app.

The current steganography container appends a StegaHide payload to the carrier image data. This is intended for private, local sharing workflows and should not be treated as a substitute for a formal covert-channel security audit.

## Project structure

```text
app/(tabs)/index.tsx       Main mobile studio UI
lib/steganography-core.ts  Capacity, encryption, embedding, and extraction logic
lib/steganography.ts       Expo filesystem adapter
components/                Shared React Native components
assets/images/             App icons and splash assets
tests/                     Unit tests
.github/workflows/         Automated Android APK build
```

## License

No license has been selected yet. Until a license is added, all rights are reserved by the repository owner.
