# Auteur Windows release procedure

Auteur source is GPL-3.0-only. Windows release candidates are **unsigned** until an Authenticode signature has actually been returned and verified. The marketing website and Gumroad listing are separate launches and remain unpublished under this procedure.

## Before any downloadable binary

1. Review the exact public source commit, including its build workflow and this policy. Confirm the repository contains no secrets, personal projects, QA captures or third-party material lacking redistribution rights.
2. Run the manual `Windows release candidate` workflow on that commit with `upload_compliant_bundle=false`. The default run uploads no executable. Require green typecheck, all tests, locked-source build, package audit and fresh-profile MP4/WebM export.
3. Independently rebuild from `Auteur-FFmpeg-Corresponding-Source.zip` in an empty MSYS2 UCRT64 directory. Verify all five source hashes and that the result has the required codecs and only allowed Windows DLL imports. A byte-identical rebuilt EXE is not required across toolchain revisions.
4. Test the portable wrapper on a clean Windows profile: create a project; export and reopen MP4/H.264 and WebM/VP9 with and without supported audio; cancel a render over an existing file and confirm the old bytes survive. Check that the wrapper contains only program files and required license notices.
5. Review `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CODE_SIGNING_POLICY.md`, the FFmpeg source manifest, build record and SHA-256 values. Do not distribute the old development-only Gyan FFmpeg.

Only after these gates pass on the final reviewed commit, explicitly dispatch the same workflow with `upload_compliant_bundle=true`. Its one public Actions artifact must contain the unsigned portable EXE, matching FFmpeg corresponding-source ZIP, full notices, build record, rebuild instructions and `SHA256SUMS.txt`. A public Actions artifact is a distribution, not private staging. Download it and recheck hashes, files and behavior before making a GitHub Release.

## Publish the unsigned GitHub release

Publish a release only from the tested commit. Put the EXE and matching FFmpeg source ZIP on the **same GitHub release**, together with SHA-256 values, licenses/notices, build instructions and a clear “unsigned Windows executable” warning. Identify the source commit and tested workflow run. Verify both download links while signed out. Do not point a download button to a missing or different asset. The website and Gumroad must not be published by this step.

## Apply for signing afterward

[SignPath Foundation](https://signpath.org/terms.html) requires an already released, documented OSI-licensed application. After the public unsigned release exists, submit its repository, release page, [code signing policy](../../CODE_SIGNING_POLICY.md), source/build evidence and maintainer identity through the [Foundation application](https://signpath.org/). SignPath account login, multi-factor authentication, GitHub App installation, consent and each signing approval are maintainer actions. Never put signing credentials in this repository or automate a human approval.

If accepted, sign only Auteur-owned release artifacts from a trusted GitHub build. Do not sign the bundled upstream FFmpeg binary as Auteur. Verify the returned Authenticode publisher, product/version metadata and artifact hash before labeling or publishing an asset as signed. If SignPath declines or requests changes, keep the unsigned release clearly labeled and report the actual response; no certificate or signature may be claimed by anticipation.
