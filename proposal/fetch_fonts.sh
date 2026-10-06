#!/usr/bin/env bash
# Fetches the two Google Fonts the letter of intent is set in, into
# proposal/fonts/, where build_letter.py looks for them.
#
# The deck does not need this: a .pptx carries font *names*, which the viewer's
# own PowerPoint resolves, so it is set in Cambria and Calibri instead.
#
# The user agent matters. Google's CSS endpoint serves a different format per
# browser, and the modern one is woff2, which ReportLab cannot read. An Android
# 2.2 agent is the one that still gets plain TrueType.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p fonts

UA="Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"

grab () { # family weight outfile
  local url
  url=$(curl -fsS -A "$UA" "https://fonts.googleapis.com/css?family=$1:$2" \
        | grep -oE 'https://fonts.gstatic.com/[^)]*')
  if [ -z "$url" ]; then
    echo "could not resolve $1 $2" >&2
    return 1
  fi
  curl -fsS -o "fonts/$3" "$url"
  printf '%-24s %8s bytes\n' "$3" "$(stat -c%s "fonts/$3")"
}

grab "Inter"             400 Inter-Regular.ttf
grab "Inter"             500 Inter-Medium.ttf
grab "Inter"             600 Inter-SemiBold.ttf
grab "Inter"             700 Inter-Bold.ttf
grab "Plus+Jakarta+Sans" 500 Jakarta-Medium.ttf
grab "Plus+Jakarta+Sans" 700 Jakarta-Bold.ttf
grab "Plus+Jakarta+Sans" 800 Jakarta-ExtraBold.ttf
