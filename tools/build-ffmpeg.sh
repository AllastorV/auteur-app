#!/usr/bin/env bash
set -euo pipefail

if [[ "${MSYSTEM:-}" != UCRT64 ]]; then
  echo 'This release build requires an MSYS2 UCRT64 shell.' >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
work="$repo_root/release-work/ffmpeg"
sources="$work/sources"
source_tree="$work/source-tree"
prefix="$work/prefix"
jobs="${NUMBER_OF_PROCESSORS:-4}"

for tool in node gcc g++ nasm pkg-config make tar sha256sum objdump pacman diff; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done

node --input-type=module -e "import {fetchLockedSources} from './tools/ffmpeg-sources.mjs'; await fetchLockedSources('tools/ffmpeg-source-lock.json', 'release-work/ffmpeg/sources')"

mkdir -p "$source_tree" "$prefix" "$work/licenses"
lock_field() {
  node -p "require('./tools/ffmpeg-source-lock.json').sources['$1']['$2']"
}
ffmpeg_version="$(lock_field ffmpeg version)"
x264_commit="$(lock_field x264 commit)"
libvpx_commit="$(lock_field libvpx commit)"
opus_version="$(lock_field libopus version)"
zlib_version="$(lock_field zlib version)"

tar -xf "$sources/ffmpeg-$ffmpeg_version.tar.xz" -C "$source_tree"
tar -xf "$sources/x264-$x264_commit.tar.gz" -C "$source_tree"
mkdir -p "$source_tree/libvpx-$libvpx_commit"
tar -xf "$sources/libvpx-$libvpx_commit.tar.gz" -C "$source_tree/libvpx-$libvpx_commit"
tar -xf "$sources/opus-$opus_version.tar.gz" -C "$source_tree"
tar -xf "$sources/zlib-$zlib_version.tar.gz" -C "$source_tree"

export PKG_CONFIG_PATH="$prefix/lib/pkgconfig"
export PKG_CONFIG_LIBDIR="$PKG_CONFIG_PATH"
export PATH="/ucrt64/bin:/usr/bin:$PATH"

run_build() {
  local source_dir="$1"
  shift
  cd "$source_dir"
  printf '%q ' "$@" >> "$work/build-commands.txt"
  printf '\n' >> "$work/build-commands.txt"
  "$@"
  make -j"$jobs"
  make install
  cd "$repo_root"
}

: > "$work/build-commands.txt"
run_build "$source_tree/zlib-$zlib_version" ./configure --prefix="$prefix" --static
run_build "$source_tree/x264-$x264_commit" ./configure \
  --prefix="$prefix" --host=x86_64-w64-mingw32 \
  --enable-static --disable-cli --disable-opencl

run_build "$source_tree/libvpx-$libvpx_commit" ./configure \
  --prefix="$prefix" --target=x86_64-win64-gcc --as=nasm \
  --enable-static --disable-shared --disable-examples --disable-tools \
  --disable-docs --disable-unit-tests --disable-webm-io

run_build "$source_tree/opus-$opus_version" ./configure \
  --prefix="$prefix" --host=x86_64-w64-mingw32 \
  --enable-static --disable-shared --disable-doc --disable-extra-programs

run_build "$source_tree/ffmpeg-$ffmpeg_version" ./configure \
  --prefix="$prefix" --pkg-config-flags=--static \
  --extra-cflags="-I$prefix/include" \
  --extra-ldflags="-L$prefix/lib -static -static-libgcc" \
  --enable-gpl --enable-version3 --disable-autodetect \
  --enable-libx264 --enable-libvpx --enable-libopus --enable-zlib \
  --enable-static --disable-shared --disable-doc --disable-debug \
  --disable-ffplay --disable-ffprobe

cp "$prefix/bin/ffmpeg.exe" "$work/ffmpeg.exe"
cp "$source_tree/ffmpeg-$ffmpeg_version/COPYING.GPLv3" "$work/licenses/ffmpeg-GPLv3.txt"
cp "$source_tree/ffmpeg-$ffmpeg_version/LICENSE.md" "$work/licenses/ffmpeg-LICENSE.md"
cp "$source_tree/x264-$x264_commit/COPYING" "$work/licenses/x264-COPYING.txt"
cp "$source_tree/libvpx-$libvpx_commit/LICENSE" "$work/licenses/libvpx-LICENSE.txt"
cp "$source_tree/libvpx-$libvpx_commit/PATENTS" "$work/licenses/libvpx-PATENTS.txt"
cp "$source_tree/opus-$opus_version/COPYING" "$work/licenses/libopus-COPYING.txt"
cp "$source_tree/zlib-$zlib_version/LICENSE" "$work/licenses/zlib-LICENSE.txt"

node tools/ffmpeg-build-record.mjs
echo "Source-built FFmpeg: $work/ffmpeg.exe"
