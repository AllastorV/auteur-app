# Auteur third-party notices

Auteur's own source is offered under `GPL-3.0-only`. The components below keep
their own copyright and license terms. This index is not a replacement for the
full license files referenced here or for corresponding source where required.

| Component | Copyright / license | Full local notice |
| --- | --- | --- |
| Courier Prime | Copyright 2015 The Courier Prime Project Authors; SIL Open Font License 1.1 | [`third_party_licenses/courier-prime-OFL.txt`](third_party_licenses/courier-prime-OFL.txt) |
| Tinos | Copyright 2026 The Tinos Project Authors; SIL Open Font License 1.1 | [`third_party_licenses/tinos-OFL.txt`](third_party_licenses/tinos-OFL.txt) |
| IBM Plex Sans Condensed | Copyright IBM Corp.; SIL Open Font License 1.1 | [`third_party_licenses/ibm-plex-sans-condensed-OFL.txt`](third_party_licenses/ibm-plex-sans-condensed-OFL.txt) |
| Electron 33.4.11 and Chromium | Electron MIT and individual Chromium component licenses | The packaged Electron runtime's `LICENSE` and `LICENSES.chromium.html` files. |
| FFmpeg 6.1.1 Gyan essentials build via `ffmpeg-static@5.3.0` | FFmpeg binary GPL version 3; wrapper GPL-3.0-or-later | Installed `ffmpeg.exe.LICENSE` and `ffmpeg.exe.README`, which must remain with the packaged runtime. See [FFmpeg source commit](https://github.com/FFmpeg/FFmpeg/commit/e38092ef93). Matching build/dependency source distribution remains a public-release gate. |

Other bundled JavaScript dependencies retain their package licenses. The
release package audit must enumerate the actual production bundle and ensure
that required notices survive packaging. The [rights inventory](docs/release/rights-inventory.md)
records evidence, exclusions and outstanding release conditions.
