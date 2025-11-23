#!/usr/bin/env bash
set -euo pipefail

echo "Updating package index..."
sudo apt update

echo "Installing ffmpeg, exiftool, yt-dlp..."
sudo apt install -y ffmpeg exiftool yt-dlp

echo "Done. Ensure 'magick' (ImageMagick 7) is installed separately as noted in README."
