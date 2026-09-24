# Auteur Windows release: source-built FFmpeg and SignPath design

Date: 2026-09-24
Status: approved design; implementation and release gates in progress
Scope: the existing public `AllastorV/auteur-app` repository and its Windows portable release. The website and Gumroad listing stay unpublished.

## Goal and constraints

Ship an Auteur Windows executable whose bundled FFmpeg can be traced to complete corresponding source, then make the project eligible to apply for SignPath Foundation's open-source signing. MP4/H.264 and WebM/VP9 animatic export, with optional MP3/WAV/M4A/AAC/Ogg audio input, must continue to work without a separate user installation. Source, licenses, build instructions and checksums must be available beside the unsigned binary before it is published.

The current `ffmpeg-static@5.3.0` Windows payload is a Gyan FFmpeg 6.1.1 GPLv3 build. Its FFmpeg commit and some dependency versions are known, but a complete matching source/build bundle has not been verified. It must not be represented as release-compliant merely by linking to FFmpeg's repository. The existing security branch is the release baseline; its changes still require normal review and checks.

## Chosen approach

Build a deliberately small GPLv3 FFmpeg on a GitHub-hosted Windows runner using MSYS2 UCRT64. Use the official FFmpeg 9.0.2 source release, official VideoLAN x264 source, official WebM libvpx source and official Xiph libopus 1.6.1 source, and official zlib 1.3.2 source for PNG decoding. Pin all five to immutable source identities in a checked-in lock manifest: tarball SHA-256 values and full Git commits where Git is used. The implementation selects stable x264 and libvpx commits once, records their full identities, and CI rejects a moving branch or tag as a build input.

The required capabilities are PNG frame input; native decoding of MP3, WAV, M4A, AAC and Ogg audio; native AAC output for MP4; libopus output for WebM; libx264 H.264; and libvpx VP9. The current shared audio path requests AAC even for WebM, so the implementation must select Opus for WebM. The build disables automatic optional dependency discovery and non-free components. General-purpose compiler/build tools are recorded by version. Any non-system runtime DLL dependency must either be removed by static linking or shipped with its own source and notice; an unexpected import fails the release audit. The Gyan executable is excluded from release artifacts.

Alternatives considered: retain the Gyan payload and manually collect its many external libraries (weak provenance), or make users install FFmpeg separately (breaks the chosen out-of-box workflow). Neither is selected.

## Build and package flow

1. A manual GitHub Actions release-candidate workflow checks out one reviewed public commit and installs pinned or recorded MSYS2 toolchain packages.
2. The workflow downloads only the locked source archives/commits, verifies their identities, builds zlib, x264, libvpx and libopus, then builds FFmpeg. Build scripts and configure flags live in the Auteur repository.
3. It produces `ffmpeg.exe`, a source ZIP containing the exact FFmpeg/x264/libvpx/libopus/zlib snapshots and build scripts, their license texts, a toolchain record and SHA-256 manifest.
4. Electron Builder copies this executable to a dedicated resource path outside ASAR. Packaged runtime resolution uses that path; source/dev tests may continue using the existing `ffmpeg-static` fallback. Packaging explicitly excludes its Gyan executable and outdated Gyan notices.
5. The release audit opens the actual Windows package, verifies the FFmpeg hash, source-manifest match, license files, absence of the Gyan payload and unexpected DLLs, and rejects tests, personal files, secrets and QA material.
6. The default manual workflow builds and tests without uploading an executable. A second explicitly enabled dispatch may upload one compliant bundle only after source, package and pre-upload local QA gates pass. Actions artifacts in this public repository are downloadable, so that upload is treated as first public binary distribution, not private staging. The bundle and run summary disclose the EXE, matching source ZIP, full notices, hashes and build instructions; GitHub Release publication remains a separate manual step.

The public GitHub release contains the unsigned Auteur EXE, the matching FFmpeg source ZIP, the Auteur source commit, licenses, SHA-256 manifest, build instructions and an explicit unsigned warning. The release/download page links to the source ZIP on the same hosting service as the binary. The unpublished marketing website and Gumroad are not part of this step.

## SignPath sequence

SignPath Foundation requires a maintained OSI-licensed project already released in the form to be signed, documented functionality, a public code-signing policy, MFA and a verifiable build origin. The policy names AllastorV as the sole current maintainer/reviewer/approver, describes optional collaboration and installer changes, and does not claim a signature before approval.

After the compliant unsigned GitHub release exists, submit the Foundation application with the repository, release, policy and build links. Account login, MFA, GitHub App installation, organization setup and each signing approval remain explicit human-controlled actions; no credential is stored in source or supplied by the assistant. On acceptance, connect the reviewed GitHub-hosted build artifact to SignPath's trusted-build workflow, enforce Auteur product/version metadata, obtain a manual signing approval and verify the resulting Authenticode signature. Upstream FFmpeg remains an unsigned upstream component, not a binary signed under Auteur's identity.

SignPath approval is an external decision, not a release gate that can be declared passed locally. If it declines or requests changes, keep the unsigned release clearly labeled and address the stated conditions before another application.

## Verification and stop conditions

- Source lock, source ZIP and build logs identify the same inputs; the executable reports the intended configure flags and passes an import-table audit.
- A clean Windows build, typecheck, tests and package-content audit pass from the exact release commit.
- A fresh Auteur profile successfully exports and reopens MP4/H.264 and WebM/VP9 animatics both with and without audio; cancellation preserves the previous output.
- The public asset hashes match the tested candidate; no Gyan FFmpeg binary, proprietary asset or private project is included.
- Before the first Actions artifact upload, the downloadable bundle and run summary provide the matching source and notices; before GitHub Release asset publication, the release page links to the same source ZIP and notices.
- No SignPath application is described as submitted, no certificate as granted and no executable as signed without external confirmation and signature verification.

Official references: [FFmpeg legal checklist](https://ffmpeg.org/legal.html), [FFmpeg 9.0.2 source](https://ffmpeg.org/download.html), [SignPath Foundation conditions](https://signpath.org/terms.html), [SignPath GitHub trusted builds](https://docs.signpath.io/trusted-build-systems/github), [GitHub Actions artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).
