# Releasing Card Spy

Releases are built by GitHub Actions ([`release.yml`](.github/workflows/release.yml)). Pushing a version tag builds macOS (Apple Silicon and Intel), Windows and Linux, and uploads the installers to a **draft** GitHub release. You check the draft, then publish it. The website's download buttons always point at the latest published release.

## Each release

1. Make sure `master` is green in CI, and run the app once with `npm start`.
2. Bump the version. This creates a commit and a `vX.Y.Z` tag:
   ```bash
   npm version 3.1.0 -m "chore: release %s"
   ```
3. Push the commit and the tag:
   ```bash
   git push origin master --follow-tags
   ```
4. Wait for the **Release** workflow in the Actions tab, about 10–15 minutes. It creates the draft release with generated notes, and each platform's job uploads its files:

   | Platform | Files |
   | --- | --- |
   | macOS | `card-spy-X.Y.Z-mac-arm64.dmg`, `…-mac-x64.dmg`, and a `.zip` of each |
   | Windows | `card-spy-X.Y.Z-win-x64.exe` (installer) |
   | Linux | `card-spy-X.Y.Z-linux-x86_64.AppImage`, `card-spy-X.Y.Z-linux-amd64.deb` |

5. Check the draft:
   - Download the macOS `.dmg` and open it. A signed and notarized app opens without a warning. You can also check it with `spctl -a -vv "/Applications/Card Spy.app"`, which should say `accepted` and `source=Notarized Developer ID`.
   - Edit the generated notes into something worth reading: features, fixes, anything people need to know.
6. Publish the release.

If a build fails, fix it on `master`. Then delete the draft release and the tag (`git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z`), and tag again.

To try the pipeline without releasing anything, run the **Release** workflow by hand (**Actions → Release → Run workflow**). It builds the installers as downloadable workflow artifacts and publishes nothing.

## One-time setup: macOS signing and notarization

Until these secrets exist, the macOS build is unsigned. People can still open an unsigned build, but only by right-clicking it and choosing **Open**. Add the secrets once:

1. **Export the signing certificate.** In Keychain Access, under **My Certificates**, right-click **Developer ID Application: Tom Kemp-Potter (7JSTFD84WQ)**, choose **Export**, and save it as a `.p12` with a strong password.
2. **Create an app-specific password** for notarization. Go to [account.apple.com](https://account.apple.com), then **Sign-In and Security → App-Specific Passwords**.
3. Store the secrets in the repo. Each `gh secret set` without `--body` prompts for the value, so nothing lands in your shell history:
   ```bash
   base64 -i DeveloperID.p12 | gh secret set CSC_LINK --repo tomkp/card-spy
   gh secret set CSC_KEY_PASSWORD --repo tomkp/card-spy            # the .p12 password
   gh secret set APPLE_ID --repo tomkp/card-spy                    # your Apple ID email
   gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo tomkp/card-spy # from step 2
   gh secret set APPLE_TEAM_ID --repo tomkp/card-spy --body 7JSTFD84WQ
   ```
4. Delete the `.p12` file.

Windows and Linux builds are unsigned. Windows SmartScreen may warn on first launch until the app builds up a reputation; click **More info → Run anyway**.

## Building locally

```bash
npm run dist     # installers for this OS in dist/
```

On a Mac with the Developer ID certificate in your keychain, electron-builder signs automatically. To skip signing, set `CSC_IDENTITY_AUTO_DISCOVERY=false`. To notarize locally, set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` as well.

## The icon

`build/icon.svg` is the source. After changing it, run `npm run icons` (macOS, needs `brew install librsvg`) to regenerate `build/icon.icns`, `build/icon.ico`, `build/icon.png` and `resources/icon.png`, and commit them.
