#!/usr/bin/env bash
# Usage: ./scripts/extract-release-notes.sh 1.4.0
# Outputs the CHANGELOG section for the given version to RELEASE_NOTES.md

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

awk "/^## \[${VERSION}\]/,/^## \[/" CHANGELOG.md \
  | head -n -1 \
  > RELEASE_NOTES.md

if [ ! -s RELEASE_NOTES.md ]; then
  echo "No changelog entry found for ${VERSION}" >&2
  exit 1
fi
