# WEPP

This repository contains the interactive visualization dashboard for the [WEPP](https://github.com/TurakhiaLab/WEPP/tree/main) (Wastewater-based Epidemiology using Phylogenetic Placements) Tool. The dashboard enables researchers and public health officials to explore detected haplotypes, inspect read-level alignments, and visualize unaccounted mutations in the context of a global phylogeny.

## Features

- Phylogenetic tree exploration powered by Taxonium.

- Interactive genome browser with mutation tracks (via JBrowse2 plugin).

- Real-time read-level analysis and variant inspection.


## Getting Started

### Preprocess the tree sequence
Convert your `.pb` file (UShER MAT file) into a `.jsonl` using `usher_to_taxonium`. This step prepares the tree for interactive visualization.

```bash
pip install taxoniumtools

cd taxonium_backend

usher_to_taxonium -i input.pb -o output.jsonl --name_internal_nodes -j config_public.json
```

### Run with docker. 

```bash
# Build the Docker image
docker build -t wepp-dashboard .

# Runs the dashboard as a web server (e.g., http://localhost:80), mounting your `.jsonl` tree file and setting Node.js memory for large trees. If port 80 is unavailable, forward to another port (e.g., `-p 8080:80`).
# Run the dashboard container
docker run \
  -v /absolute/path/to/your/folder/containing/taxonium:/data \
  -e DATA_FILE=/data/your_file.jsonl \
  -e NODE_MEMORY_LIMIT=6144 \
  -p 80:80 \
  wepp-dashboard
```
⚠️ Replace the folder path with where your .jsonl or .jsonl.gz file is, and set DATA_FILE to its name (e.g., /data/myfile.jsonl).
Dashboard runs at http://localhost.


## Run Locally (Without Docker)

### start backend: 
```bash
cd taxonium_backend

nvm use 22

yarn install

# this will start part 8080
node --expose-gc server.js --port 8080 --data_file path-to-taxonium.jsonl
```

### start frontend:

```bash
cd dashboard           # Navigate to the dashboard project folder
nvm use 22             # Ensure you're using Node.js v22 (must be installed via nvm)
yarn preinstall        # Run any pre-installation scripts (if defined)
yarn install           # Install frontend dependencies
yarn dev               # Start the development server on port 5173 (default)
```
⚠️ Remove any existing node_modules directory before setup to prevent conflicts:
```bash
rm -rf node_modules
```

The dashboard will be accessible at: http://localhost:5173

This setup is intended for development. For production deployment, run:
```bash
yarn build
```

# Citation

If you use the dashboard or WEPP in your work, please cite:

TBA
