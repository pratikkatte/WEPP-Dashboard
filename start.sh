#!/usr/bin/env bash
set -e

mkdir -p /srv/wepp
ln -sfn "$(realpath ./results)" /srv/wepp/results

if [ -f ./results/projects.json ]; then
  echo "[WEPP-Dashboard] Found projects.json, retrieving project information..."
  read TAXONIUM_FILE_PATH TAXONIUM_SIZE < <(python3 -c "
import json
with open('./results/projects.json') as f:
    data = json.load(f)
max_size = 0
for v in data.values():
    try:
        size = int(v.get('taxonium_size', 0))
        if size > max_size:
            max_size = size
    except Exception:
        continue
k = '${PROJECT_NAME}'
if k in data:
    print(
        data[k].get('taxonium_file_path', ''),
        max_size,
        sep=' '
    )
else:
    print('Project name not found.', '')
")
  if [ -n "$TAXONIUM_FILE_PATH" ] && [ "$TAXONIUM_FILE_PATH" != "Project name not found." ]; then
    echo "[WEPP-Dashboard] Using project: '${PROJECT_NAME}'"
    echo "[WEPP-Dashboard] taxonium_file_path: ${TAXONIUM_FILE_PATH}"

    if [[ "${TAXONIUM_FILE_PATH}" == *.gz ]]; then
        TAXONIUM_SIZE=$(( TAXONIUM_SIZE * 10 ))
    fi
    TAXONIUM_SIZE=$(( TAXONIUM_SIZE + 2048 ))
    echo "[WEPP-Dashboard] taxonium_size: ${TAXONIUM_SIZE} MB"

  else
    echo "[WEPP-Dashboard] Error: Project name '${PROJECT_NAME}' not found in projects.json"
    exit 1
  fi
else
  echo "[WEPP-Dashboard] Error: projects.json not found in ./results."
  exit 1
fi

echo "[WEPP-Dashboard] Launching dashboard backend server..."
node --expose-gc --max-old-space-size=${TAXONIUM_SIZE:-4096} \
  /app/taxonium_backend/server.js \
  --port 8080 --data_file "results/$PROJECT_NAME/$TAXONIUM_FILE_PATH" \
  --config_json /app/taxonium_backend/config_public.json &

echo "[WEPP-Dashboard] Waiting for backend to start..."
until ss -tuln | grep -q ':8080'; do
  sleep 1
done

echo "[WEPP-Dashboard] backend is running."

echo "[WEPP-Dashboard] Starting Nginx (serving dashboard to http://localhost:80)..."
nginx -g 'daemon off;'

echo "[WEPP] Nginx is running. WEPP dashboard available at: http://localhost:80"