#!/usr/bin/env sh
set -eu

GRADLE_VERSION='8.7'
DIST_URL="https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOT_DIR="${BASE_DIR}/.gradle-bootstrap"
GRADLE_DIR="${BOOT_DIR}/gradle-${GRADLE_VERSION}"
ZIP_PATH="${BOOT_DIR}/gradle-${GRADLE_VERSION}-bin.zip"

if [ ! -x "${GRADLE_DIR}/bin/gradle" ]; then
  mkdir -p "${BOOT_DIR}"

  if [ ! -f "${ZIP_PATH}" ]; then
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "${DIST_URL}" -o "${ZIP_PATH}"
    elif command -v wget >/dev/null 2>&1; then
      wget -q "${DIST_URL}" -O "${ZIP_PATH}"
    else
      echo 'Missing curl/wget to download Gradle.' >&2
      exit 1
    fi
  fi

  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "${ZIP_PATH}" -d "${BOOT_DIR}"
  else
    (cd "${BOOT_DIR}" && jar xf "${ZIP_PATH}")
  fi
fi

exec "${GRADLE_DIR}/bin/gradle" "$@"