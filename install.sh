#!/usr/bin/env bash
#
# Install Noctua's static assets into a web root.
#
#   ./install.sh                  # -> /usr/share/noctua (default)
#   ./install.sh /var/www/noctua  # -> a custom destination
#
# Copies only the runtime files (no dev fixtures, git metadata, or this
# script), uses sudo automatically when the destination isn't writable, and
# refreshes each asset so files removed from the repo don't linger.

set -euo pipefail

DEST="${1:-/usr/share/noctua}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The runtime assets — everything the app serves, and nothing else.
ASSETS=(index.html manifest.webmanifest sw.js css js vendor icons)

if [[ -z "$DEST" || "$DEST" == "/" ]]; then
  echo "error: refusing to install to '$DEST'" >&2
  exit 1
fi
if [[ ! -f "$SRC/index.html" ]]; then
  echo "error: $SRC doesn't look like the Noctua repo (no index.html)" >&2
  exit 1
fi

# Use sudo only if the destination (or the nearest existing parent) isn't ours.
parent="$DEST"
while [[ ! -e "$parent" ]]; do parent="$(dirname "$parent")"; done
if [[ -w "$parent" ]]; then SUDO=""; else SUDO="sudo"; fi

echo "Installing Noctua -> $DEST${SUDO:+  (using sudo)}"
$SUDO mkdir -p "$DEST"

cd "$SRC"
# Drop the previous copy of each asset (bounded to known names under DEST) so
# files removed from the repo don't linger, then copy the current one in.
for item in "${ASSETS[@]}"; do
  $SUDO rm -rf "${DEST:?}/$item"
done
$SUDO cp -R "${ASSETS[@]}" "$DEST/"

echo "Done — $(du -sh "$DEST" 2>/dev/null | cut -f1) in $DEST"
echo "Reload your web server if its config changed: sudo systemctl reload nginx"
