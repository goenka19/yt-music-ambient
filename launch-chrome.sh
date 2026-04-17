#!/bin/bash
# Launch Chrome with our extension loaded + remote debugging for Playwright MCP
# Usage: ./launch-chrome.sh

CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
EXT_PATH="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="/tmp/yt-music-ext-chrome-profile"
DEBUG_PORT=9222

# Kill any existing Chrome from previous runs
pkill -f "Chrome.*yt-music-ext" 2>/dev/null
rm -rf "$PROFILE_DIR"
mkdir -p "$PROFILE_DIR"

# Launch Chrome
"$CHROME_PATH" \
  --load-extension="$EXT_PATH" \
  --remote-debugging-port=$DEBUG_PORT \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://music.youtube.com" &

echo "✓ Chrome launched with:"
echo "  - Extension: $EXT_PATH"
echo "  - Debug port: $DEBUG_PORT"
echo "  - Profile: $PROFILE_DIR"
echo ""
echo "Navigate to music.youtube.com and play a song."
echo "Then tell me what song you're listening to so I can navigate there."
