#!/bin/sh
set -eu

echo "Setting umask to ${UMASK}"
umask "${UMASK}"
echo "Creating download directory (${DOWNLOAD_DIR}), state directory (${STATE_DIR}), and temp dir (${TEMP_DIR})"
mkdir -p "${DOWNLOAD_DIR}" "${STATE_DIR}" "${TEMP_DIR}"

# Optional cookies: only wire cookiefile when a valid Netscape file is present.
# App also sanitizes YTDL_OPTIONS; this avoids baking a broken empty path into the env.
COOKIES_FILE="${COOKIES_FILE:-/cookies/cookies.txt}"
if [ -z "${YTDL_OPTIONS:-}" ]; then
  if [ -f "${COOKIES_FILE}" ] && [ -s "${COOKIES_FILE}" ]; then
    # Quick Netscape-ish check: has a non-comment line with tabs
    if grep -q $'^[^#].*\t' "${COOKIES_FILE}" 2>/dev/null || head -1 "${COOKIES_FILE}" | grep -qi 'netscape\|cookie file'; then
      export YTDL_OPTIONS="{\"cookiefile\":\"${COOKIES_FILE}\"}"
      echo "Using cookies from ${COOKIES_FILE}"
    else
      echo "Warning: ${COOKIES_FILE} exists but does not look like a Netscape cookies file — ignoring"
    fi
  else
    echo "No valid cookies file at ${COOKIES_FILE} — continuing without cookies"
  fi
fi

start_bgutil() {
  echo "Starting BgUtils POT Provider"
  if [ "$(id -u)" -eq 0 ] && [ "${UID}" != "0" ]; then
    gosu "${UID}:${GID}" bgutil-pot server >/tmp/bgutil-pot.log 2>&1 &
  else
    bgutil-pot server >/tmp/bgutil-pot.log 2>&1 &
  fi
  echo $! > /tmp/bgutil-pot.pid
}

supervise_bgutil() {
  start_bgutil
  while true; do
    sleep 15
    if [ -f /tmp/bgutil-pot.pid ]; then
      pid=$(cat /tmp/bgutil-pot.pid)
      if ! kill -0 "${pid}" 2>/dev/null; then
        echo "BgUtils POT Provider exited — restarting"
        start_bgutil
      fi
    else
      start_bgutil
    fi
  done
}

if [ "$(id -u)" -eq 0 ] && [ "$(id -g)" -eq 0 ]; then
  if [ "${UID}" -eq 0 ]; then
    echo "Warning: it is not recommended to run as root user, please check your setting of the UID environment variable"
  fi
  if [ "${CHOWN_DIRS:-true}" != "false" ]; then
    echo "Changing ownership of download and state directories to ${UID}:${GID}"
    chown -R "${UID}:${GID}" /app "${DOWNLOAD_DIR}" "${STATE_DIR}" "${TEMP_DIR}" || true
  fi
  supervise_bgutil &
  echo "Running svidown as user ${UID}:${GID}"
  exec gosu "${UID}:${GID}" python3 -m app.server
else
  echo "User set by docker; running svidown as $(id -u):$(id -g)"
  supervise_bgutil &
  exec python3 -m app.server
fi
