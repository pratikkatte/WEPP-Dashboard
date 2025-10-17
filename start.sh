#!/usr/bin/env bash
set -e

mkdir -p /srv/wepp
ln -sfn "$(realpath ./results)" /srv/wepp/results

if [ -f ./results/projects.json ]; then
  echo "Reading projects.json:"
  TAXONIUM_FILE_PATH=$(python3 -c "
import json
with open('./results/projects.json') as f:
    data = json.load(f)
k = '${PROJECT_NAME}'
if k in data:
    print(data[k].get('taxonium_file_path', ''))
else:
    print('Project name not found.')
" )
  echo "taxonium_file_path for project '${PROJECT_NAME}': ${TAXONIUM_FILE_PATH}"
else
  echo "projects.json not found."
fi

echo "Starting Taxonium backend..."
node --expose-gc --max-old-space-size=${NODE_MEMORY_LIMIT:-4096} \
  /app/taxonium_backend/server.js \
  --port 8080 --data_file "results/$PROJECT_NAME/$TAXONIUM_FILE_PATH" \
  --config_json /app/taxonium_backend/config_public.json &

# Wait for Node to start
echo "Waiting for backend on port 8080..."


until ss -tuln | grep -q ':8080'; do
  sleep 1
done
echo "Backend is up."

echo "Starting Nginx..."
nginx -g 'daemon off;'