var express = require("express");
var cors = require("cors");
var compression = require("compression");
var queue = require("express-queue");
var app = express();
var fs = require("fs");
const path = require("node:path");
const os = require("node:os");
var https = require("https");
var xml2js = require("xml2js");
var axios = require("axios");
var pako = require("pako");
const multer = require('multer');
const { BamFile } = require('@gmod/bam');
const fsp = require('fs').promises;

const URL = require("url").URL;
const ReadableWebToNodeStream = require("readable-web-to-node-stream");
const { execSync } = require("child_process");
var importing;
var filtering;
var exporting;

const { program } = require("commander");

let globalTaxoniumMeta = {
  path: null,
  size: null
};

program
  .option("--ssl", "use ssl")
  .option("--port <port>", "port", 8000)
  .option("--config_json <config_json>", "config json")
  .option("--data_url <data url>", "data url")
  .option(
    "--data_file <data file>",
    "local data file, as alternative to data url"
  ).

program.parse();

const command_options = program.opts();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "taxonium"));

let projectName='';

// Ensure upload directory exists
var uploadDir = '';

uploadDir = './results';
fs.mkdirSync(uploadDir, { recursive: true });


// const projects_info = JSON.parse(fs.readFileSync(`${uploadDir}/projects.json`, 'utf8'));

let projects_info = {};

const filePath = path.join(uploadDir, 'projects.json');
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, '{}');
}


function loadProjectsInfo() {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      projects_info = JSON.parse(data);
      console.log("projects_info updated:", projects_info);
    } else {
      console.warn(`projects.json not found at: ${filePath}`);
      projects_info = {};
    }
  } catch (err) {
    console.error(`Error reading or parsing projects.json: ${err.message}`);
    projects_info = {};
  }
}

// Initial load
loadProjectsInfo();

// Watch for changes
fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    console.log('projects.json has changed. Reloading...');
    loadProjectsInfo();
  }
});


const uploadPath = path.join(uploadDir, 'uploads');
fs.mkdirSync(uploadPath, { recursive: true });

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(uploadDir, 'uploads');

    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    cb(null, file.originalname); 
  }
});

const ALLOWED_EXTENSIONS = new Set(['bam', 'bai', 'fa', 'fna', 'fasta', 'fai']);


const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 200 MB max (bam files can be large!)
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (ALLOWED_EXTENSIONS.has(extension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: .${extension}.`));
    }
  }
});



const in_cache = new Set();

const cache_helper = {
  retrieve_from_cache: (key) => {
    // console.log("retrieving ", key);
    if (!in_cache.has(key)) {
      // console.log("not found");
      return undefined;
    } else {
      // get from tmpDir, parsing the JSON
      // console.log("found");
      const retrieved = JSON.parse(fs.readFileSync(path.join(tmpDir, key)));

      return retrieved;
    }
  },
  store_in_cache: (key, value) => {
    // console.log("caching ", key);
    // store in tmpDir, serializing the JSON
    fs.writeFileSync(path.join(tmpDir, key), JSON.stringify(value));
    in_cache.add(key);
  },
};

// Either data_url or data_file must be defined, if not display error
if (
  command_options.data_url === undefined &&
  command_options.data_file === undefined
) {
  console.log("--data_file must be supplied");
  process.exit(1);
}

import("taxonium_data_handling/importing.js").then((imported) => {
  importing = imported.default;
  console.log("imported importing");
  console.log("importing is ", importing);
});

import("taxonium_data_handling/filtering.js").then((imported) => {
  filtering = imported.default;
  console.log("imported filtering");
});

import("taxonium_data_handling/exporting.js").then((imported) => {
  exporting = imported.default;
  console.log("imported exporting");
});

waitForTheImports = async () => {
  if (importing === undefined || filtering === undefined) {
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (importing !== undefined && filtering !== undefined) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }
};

var processedData = null;
var cached_starting_values = null;

let options;

app.use(cors({}));

app.use((err, req, res, next) => {
  console.error("Global Error:", err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const logStatusMessage = (status_obj) => {
  console.log("status", status_obj);
  if (process && process.send) {
    process.send(status_obj);
  }
};


const send = require('send'); // Add this import at the top

app.get('/uploads/*', (req, res) => {
  const relativePath = req.params[0]; // everything after '/uploads/'
  console.log("Trying to serve:", relativePath, "from root:", uploadDir);

  // CORS headers for JBrowse/BAM streaming
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');

  send(req, relativePath, {
    root: uploadDir,
    dotfiles: 'deny',
    index: false,
    hidden: false,
  })
    .on('error', (err) => {
      console.error("Send error:", err.message);
      if (err.status === 404) {
        res.status(404).send('File not found');
      } else if (err.status === 403) {
        res.status(403).send('Access denied');
      } else if (err.status === 416) {
        res.status(416).send('Range not satisfiable');
      } else {
        if (!res.headersSent) {
          res.status(500).send('Internal server error');
        }
      }
    })
    .on('directory', () => {
      console.error("Attempt to access directory:", relativePath);
      res.status(403).send('Directory access denied');
    })
    .on('file', (filePath) => {
      console.log("Serving file:", filePath);
    })
    .on('stream', () => {
      console.log("Streaming:", relativePath);
    })
    .pipe(res);
});

// Optional: Add OPTIONS handler for CORS preflight
app.options('/uploads/:projectname/:filename/:groupid?', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(204).send();
});


function getReferenceFromFai(faiPath) {
  try {
    const content = fs.readFileSync(faiPath, 'utf8');
    const firstLine = content.split('\n')[0].trim();

    if (!firstLine) {
      throw new Error('FAI file is empty or malformed');
    }

    const [reference_name, lengthStr] = firstLine.split('\t');
    const length = parseInt(lengthStr, 10);

    if (!reference_name || isNaN(length)) {
      throw new Error('Invalid FAI format: could not extract reference and length');
    }

    return { reference_name, length };
  } catch (err) {
    console.error("Error reading .fai file:", err);
    return null;
  }
}


app.post('/api/upload', upload.array('files', 50), async (req, res) => {


    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      projectName = 'uploads';

      const fastaFiles = req.files.filter(file => {
        const name = file.filename.toLowerCase();
        return /\.(fa|fna|fasta)$/i.test(name);
      }).map(file => file.filename);
      
      const indexFiles = req.files.filter(file => {
        const name = file.filename.toLowerCase();
        return /\.(fa|fna|fasta)\.fai$/i.test(name);
      }).map(file => file.filename);


      // Check for presence
      if (fastaFiles.length !== 1 || indexFiles.length !== 1) {
        return res.status(400).json({
          error: 'A single reference FASTA file and its index file (.fai) must be provided.'
        });
      }

      const faiInfo = getReferenceFromFai(`${uploadDir}/${projectName}/${indexFiles[0]}`);
      if (!faiInfo) {
        return res.status(400).json({ error: 'Failed to parse .fai file' });
      }


      const bamFiles = req.files
      .filter(file => file.filename.toLowerCase().endsWith('.bam'))
      .map(file => file.filename);
    
    const baiFiles = req.files
      .filter(file => file.filename.toLowerCase().endsWith('.bai'))
      .map(file => file.filename);
    
    // // Step 1: Must have exactly 2 BAMs
    // if (bamFiles.length !== 2) {
    //   return res.status(400).json({
    //     error: `Exactly 2 BAM files must be provided. Received ${bamFiles.length}.`
    //   });
    // }
    
    // Step 2: Must have a corresponding .bai file for each .bam
    const missingIndexes = bamFiles.filter(bam => {
      const expectedBai = bam + '.bai';
      return !baiFiles.includes(expectedBai);
    });
    
    if (missingIndexes.length > 0) {
      return res.status(400).json({
        error: `Missing .bai index file(s) for: ${missingIndexes.join(', ')}`
      });
    }

      const project_config = {
        project_name: projectName,
        taxonium_file_path: globalTaxoniumMeta.path,
        "reference_name": faiInfo.reference_name,
        "start": 0,
        "end": faiInfo.length,
        "ref_file": fastaFiles[0]
      };


      
      const selectedNodes = await selectNodes(bamFiles, projectName);
    

      res.json({
        response: selectedNodes,
        config: project_config,
        status: "success"
      });
    } catch (e) {
      console.error("Upload processing error:", e);
      res.status(500).json({ error: 'Internal server error', status: 'error' });
      // next(e); // Pass error to global error handler
    }
  });


  const getFoldersWithBams = (directory, result = []) => {
    const files = fs.readdirSync(directory);
  
    files.forEach((file) => {
      const fullPath = path.join(directory, file);
  
      // Skip any folder named 'uploads'
      if (file === 'uploads') return;
  
      if (fs.statSync(fullPath).isDirectory()) {
        result.push(file);

        // Recurse into subdirectory
        // getFoldersWithBams(fullPath, result);
      }
    });
  
    return result;
  };
  


app.post('/api/projects', function(req, res) {

  const dir_path = `${uploadDir}/`
  const project_keys = getFoldersWithBams(dir_path);
  const projects_info_keys = Object.keys(projects_info);

  const intersection = project_keys.filter(key => projects_info_keys.includes(key));
  res.send({"results": intersection,'taxonium_file': globalTaxoniumMeta.path, "status": "success", "error": null})

});

async function getAllBamFiles(startingFolder) {
  const bamFiles = [];

  async function recurse(currentPath, relativeBase) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativeBase, entry.name);

      if (entry.isDirectory()) {
        await recurse(entryPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.bam')) {
        bamFiles.push(relPath);
      }
    }
  }

  try {
    await recurse(startingFolder, '.'); // relativeBase starts as "."
    return bamFiles;
  } catch (err) {
    console.error('Error traversing directory:', err);
    return [];
  }
}

app.post('/api/result/:folder', async function(req, res) {
  const { folder } = req.params;
  projectName = folder

  const fullpath = `${uploadDir}/${folder}`
  try {
    // Check if the directory exists
    if (!fs.existsSync(fullpath)) {
      return res.status(404).json({ error: 'Directory not found', status: 'error' });
    }
    
    // const files = fs.readdirSync(fullpath).filter(file => file.endsWith('.bam'));
    const bamFiles = await getAllBamFiles(path.join(uploadDir, folder));
    
    var specific_project = projects_info[folder]

  const results_config = await selectNodes(bamFiles, projectName)
  const project_config = {'project_name':folder,
                          ...specific_project
                        }
  console.log("project_config", project_config)
  res.json({ "response": results_config, "config": project_config,"status": "success"});
  } catch (err) {
    console.error("Error processing request", err);
    res.status(500).json({ error: 'Internal server error', status: 'error' });
  }
})

app.get("/", function (req, res) {
  res.send("Hello World, Taxonium is here!");
});

app.get("/search", function (req, res) {
  const start_time = Date.now();
  // console.log("/search");
  const json = req.query.json;
  const spec = JSON.parse(JSON.parse(json));
  console.log(spec);

  const minYbound =
    req.query.min_y !== undefined ? req.query.min_y : processedData.overallMinY;
  const maxYbound =
    req.query.max_y !== undefined ? req.query.max_y : processedData.overallMaxY;
  const minXbound =
    req.query.min_x !== undefined ? req.query.min_x : processedData.overallMinX;
  const maxXbound =
    req.query.max_x !== undefined ? req.query.max_x : processedData.overallMaxX;

  const forSingleSearch = {
    data: processedData.nodes,
    spec,
    min_y: minYbound,
    max_y: maxYbound,
    min_x: minXbound,
    max_x: maxXbound,
    y_positions: processedData.y_positions,
    mutations: processedData.mutations,
    node_to_mut: processedData.node_to_mut,
    xType: req.query.xType,
    cache_helper: cache_helper,
  };

  const result = filtering.singleSearch(forSingleSearch);
  validateSIDandSend(result, req.query.sid, res);
  // console.log(
  //   "Found " +
  //     result.data.length +
  //     " results in " +
  //     (Date.now() - start_time) +
  //     "ms"
  // );
  // console.log("Result type was " + result.type);
});

let path_for_config = command_options.config_json;
let config;

// Check if config passed in a valid URL
const stringIsAValidUrl = (s) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};

if (stringIsAValidUrl(path_for_config)) {
  console.log("CONFIG_JSON detected as a URL. Downloading config.");
  // Delete any trailing /
  path_for_config = path_for_config.endsWith("/")
    ? path_for_config.slice(0, -1)
    : path_for_config;

  // Download file through wget
  execSync(`wget -c ${path_for_config}`);

  // Extract file name
  const splitURL = path_for_config.split("/");
  const fileName = splitURL[splitURL.length - 1];

  path_for_config = fileName;

  console.log("Config name set to", path_for_config);
}

// check if path exists
if (path_for_config && fs.existsSync(path_for_config)) {
  config = JSON.parse(fs.readFileSync(path_for_config));
} else {
  config = { title: "", source: "", no_file: true };
}

app.get("/config", function (req, res) {
  
  config.num_nodes = processedData.nodes.length;
  config.initial_x =
    (processedData.overallMinX + processedData.overallMaxX) / 2;
  config.initial_y =
    (processedData.overallMinY + processedData.overallMaxY) / 2;
  config.initial_zoom = -2;
  config.genes = processedData.genes;
  config.mutations = processedData.mutations;
  config = { ...config, ...processedData.overwrite_config };
  config.rootMutations = processedData.rootMutations;
  config.rootId = processedData.rootId;

  validateSIDandSend(config, req.query.sid, res);
});

app.get("/nodes/", function (req, res) {
  const start_time = Date.now();
  let min_y =
    req.query.min_y !== undefined ? req.query.min_y : processedData.overallMinY;
  let max_y =
    req.query.max_y !== undefined ? req.query.max_y : processedData.overallMaxY;
  let min_x =
    req.query.min_x !== undefined ? req.query.min_x : processedData.overallMinX;
  let max_x =
    req.query.max_x !== undefined ? req.query.max_x : processedData.overallMaxX;
  if (min_y < processedData.overallMinY) {
    min_y = processedData.overallMinY;
  }
  if (max_y > processedData.overallMaxY) {
    max_y = processedData.overallMaxY;
  }
  if (min_x < processedData.overallMinX) {
    min_x = processedData.overallMinX;
  }
  if (max_x > processedData.overallMaxX) {
    max_x = processedData.overallMaxX;
  }
  let result;

  if (
    min_y === processedData.overallMinY &&
    max_y === processedData.overallMaxY &&
    min_x === processedData.overallMinX &&
    max_x === processedData.overallMaxX &&
    req.query.xType === "x_dist"
  ) {
    result = cached_starting_values;

    console.log("Using cached values");
  } else {
    result = filtering.getNodes(
      processedData.nodes,
      processedData.y_positions,
      min_y,
      max_y,
      min_x,
      max_x,
      req.query.xType
    );
  }
  console.log("Ready to send after " + (Date.now() - start_time) + "ms.");

  // This will be sent as json
  validateSIDandSend({ nodes: result }, req.query.sid, res);
  console.log(
    "Request took " +
      (Date.now() - start_time) +
      "ms, and output " +
      result.length +
      " nodes."
  );
});

function startListening() {
  if (command_options.ssl) {
    options = {
      key: fs.readFileSync(
        "/etc/letsencrypt/live/api.taxonium.org/privkey.pem"
      ),
      ca: fs.readFileSync("/etc/letsencrypt/live/api.taxonium.org/chain.pem"),
      cert: fs.readFileSync(
        "/etc/letsencrypt/live/api.taxonium.org/fullchain.pem"
      ),
    };
    https.createServer(options, app).listen(command_options.port, "0.0.0.0");
    // console.log("SSL on port " + command_options.port);
  } else {
    app.listen(command_options.port, "0.0.0.0");
    // console.log("Non SSL on port " + command_options.port);
  }
}

let sid_cache = {};

async function validateSID(sid) {
  /*

  Create a call to https://gpsapi.epicov.org/epi3/gps_api

  with URL encoded version of the following parameters:

  {"cmd":"state/session/validate",
"client_id": "TEST-1234",
"api": {"version":1},
"sid":"RFWFYY...PQZNQQASXUR"}

packaged as req
*/
  const caching_time = 1000 * 60 * 5; // 5 minutes
  if (
    sid_cache[sid] !== undefined &&
    sid_cache[sid].time > Date.now() - caching_time &&
    sid_cache[sid].validity === "ok"
  ) {
    console.log("Using cached validity");
    return "ok";
  }

  const key = process.env.GPS_API_KEY;

  const req_obj = {
    cmd: "state/session/validate",
    client_id: key,
    api: { version: 1 },
    sid: sid,
  };
  const req_raw = JSON.stringify(req_obj);
  const req = encodeURIComponent(req_raw);
  const url = "https://gpsapi.epicov.org/epi3/gps_api?req=" + req;
  console.log(url);
  response = await axios.get(url);
  console.log("got response", response.data);
  validity =
    response.data && response.data.rc && response.data.rc === "ok"
      ? "ok"
      : "invalid";
  console.log("validity", validity);
  sid_cache[sid] = { validity: validity, time: Date.now() };
  return validity;
}

async function validateSIDandSend(to_send, sid, res) {
  if (!config.validate_SID) {
    res.send(to_send);
    return;
  }
  const validity = await validateSID(sid);

  if (validity === "ok") {
    res.send(to_send);
  } else {
    res.send({ error: "Invalid session ID" });
  }
}

app.get("/validate/", async function (req, res) {
  const start_time = new Date();
  const query_sid = req.query.sid;
  const validity = await validateSID(query_sid);
  console.log("Got validity", validity);

  res.send(validity);
  console.log(new Date() - start_time);
});

// "Takes EPI_ISL_12345" input
function get_epi_isl_url(epi_isl) {
  if (epi_isl.length > 4) {
    return (
      "https://www.epicov.org/acknowledgement/" +
      epi_isl.slice(-4, -2) +
      "/" +
      epi_isl.slice(-2) +
      "/" +
      epi_isl +
      ".json"
    );
  }
}

async function getGenBankAuthors(genbank_accession) {
  const genbank_xml_url =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=" +
    genbank_accession +
    "&rettype=gb&retmode=xml";
  const genbank_xml = await axios.get(genbank_xml_url);
  const genbank_xml_json = await xml2js.parseStringPromise(genbank_xml.data);

  let authors =
    genbank_xml_json["GBSet"]["GBSeq"][0]["GBSeq_references"][0][
      "GBReference"
    ][0]["GBReference_authors"][0]["GBAuthor"];
  authors = authors.map((x) => {
    const [last, first] = x.split(",");
    return first + " " + last;
  });
  return authors;

  //['GBSeq_xrefs'][0]['GBXref'])
}

app.get("/node_details/", async (req, res) => {
try {

  console.log("node_details", req.query)
  const start_time = Date.now();
  const query_id = req.query.id;
  const node = processedData.nodes[query_id];
  const node_mutations = processedData.node_to_mut[query_id].map((mutation) => {
    return processedData.mutations[mutation];
  });

  const detailed_node = { ...node, mutations: node_mutations };
  // If node name starts with EPI_ISL_, then get the URL

  if (
    config.enable_genbank_acknowledgement &&
    detailed_node.meta_genbank_accession
  ) {
    const genbank_accession = detailed_node.meta_genbank_accession;
    let authors;
    try {
      authors = await getGenBankAuthors(genbank_accession);
    } catch (e) {
      console.log("Error getting authors", e);
    }
    if (authors) {
      detailed_node.acknowledgements = { authors: authors.join(", ") };
    }
  }

  if (detailed_node.name.startsWith("EPI_ISL_")) {
    const acknowledgements_url = get_epi_isl_url(detailed_node.name);
    // get the data from the URL
    const response = await axios.get(acknowledgements_url).catch((e) => {
      console.log(e);
    });
    try {
      const data = response.data;
      detailed_node.acknowledgements = data;
    } catch (e) {
      detailed_node.acknowledgements = {
        covv_orig_lab:
          "The GISAID acknowledgements server did not return a valid response",
        covv_orig_lab:
          "The GISAID acknowledgements server did not return a valid response",
        covv_authors:
          "The GISAID acknowledgements server did not return a valid response",
        covv_subm_lab:
          "The GISAID acknowledgements server did not return a valid response",
      };
      console.log(e);
    }
  }
  validateSIDandSend(detailed_node, req.query.sid, res);
  console.log(
    "Request took " + (Date.now() - start_time) + "ms, and output " + node
  );

}catch(e){
  console.log("Error", e)
}
});

app.get("/tip_atts", async (req, res) => {
  const start_time = Date.now();
  const node_id = req.query.id;
  const att = req.query.att;
  const atts = filtering.getTipAtts(processedData.nodes, node_id, att);
  validateSIDandSend(atts, req.query.sid, res);
  console.log(
    "Request took " + (Date.now() - start_time) + "ms, and output " + atts
  );
});

const cleanupTaxoniumMemory = () => {
  processedData = null;
  cached_starting_values = null;

  in_cache.clear();

  if (global.gc) global.gc();

};

const loadTaxonium = async (data_file) => {

  cleanupTaxoniumMemory();
  
  const stream = fs.createReadStream(data_file);

  let supplied_object = {
      stream: stream,
      status: "stream_supplied",
      filename: data_file,
    }

    processedData = await importing.processJsonl(
      supplied_object,
      logStatusMessage,
      ReadableWebToNodeStream.ReadableWebToNodeStream
    );
  
    logStatusMessage({
      status: "finalising",
    });
  
    if (config.no_file) {
      importing.generateConfig(config, processedData);
    }
  
    processedData.genes = new Set(
      processedData.mutations.map((mutation) => mutation.gene)
    );
    // as array
    processedData.genes = Array.from(processedData.genes);
    console.log("Loaded data");
  
    result = filtering.getNodes(
      processedData.nodes,
      processedData.y_positions,
      processedData.overallMinY,
      processedData.overallMaxY,
      processedData.overallMinX,
      processedData.overallMaxX,
      "x_dist"
    );
  
    cached_starting_values = result;
    console.log("Saved cached starting vals");

    logStatusMessage({
      status: "loaded",
    });
  }

  async function getFileSizeInMB(filePath) {
    const stat = await fs.promises.stat(filePath);
    const sizeInMB = Math.ceil(stat.size / (1024 * 1024));
    return sizeInMB;
  }

  app.get("/load/:project", async (req, res) => {
    try {
      const { project } = req.params;
      const taxonium_file_path = projects_info[project]['taxonium_file_path'];
      const taxonium_size = projects_info[project]['taxonium_size'];
      
      const fullFilePath = path.resolve(uploadDir, project, taxonium_file_path);

      // const stat_size = await getFileSizeInMB(fullFilePath)
      // const stat = await fs.promises.stat(fullFilePath);

      const sameFile = (
        globalTaxoniumMeta.path === taxonium_file_path &&
        globalTaxoniumMeta.size === taxonium_size
      );
      if (sameFile) {
        res.send({'result': 'taxonium loaded'});
      } else {

        console.log("Loading taxonium file:", fullFilePath);

        const fileExt = getFullExtension(fullFilePath);
        if (![".jsonl", ".jsonl.gz"].includes(fileExt)) {
          throw new Error(`Invalid file extension: ${fileExt}. Expected .jsonl or .jsonl.gz.`);
        }
        await loadTaxonium(fullFilePath);

        globalTaxoniumMeta = {
          path: taxonium_file_path,
          size: taxonium_size
        };

        res.send({'result': 'taxonium loaded'});
      }
    } catch (error) {
      console.error("Error loading taxonium file:", error);
      res.status(500).send({'error': 'Failed to load taxonium file'});
    }
  });

// match /nextstrain_json/12345
app.get("/nextstrain_json/:root_id", async (req, res) => {
  const root_id = parseInt(req.params.root_id);
  const json = await exporting.getNextstrainSubtreeJson(
    root_id,
    processedData.nodes,
    config,
    processedData.mutations
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; " + "filename=" + root_id + ".nextstrain.json"
  );
  res.send(json);
});

// helper: parse 'UM' or 'US' from comments
function parseCommentsInfo(inputComments) {
  const outDict = {};
  inputComments.forEach((um) => {
    um = um.replace(/UM:|US:/g, ''); // replace UM: and US:
    const parts = um.split('\t');
    if (parts.length >= 2) {
      outDict[parts[0]] = parts[1];
    }
  });
  return outDict;
}

// helper: process unseen mutations
function getUnseenMutationInfo(inputString) {
  return inputString.replace('Z:', '').split(',');
}

// helper: randomly pick from array
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function selectNodes(uploadedFilenames, project_name = null) {

  const fileDict = {};
  for (const filename of uploadedFilenames) {
    try {
      // const file_path = path.join(uploadDir,`${project_name}/bams/${filename}`);
      const file_path = path.join(uploadDir, project_name,filename)
      console.log("file_path", file_path) 
      const bamFile = new BamFile({
        bamPath: file_path,
        // optional: bamFile can use index file too if needed, but not needed for header parsing
      });

      const header = await bamFile.getHeader()
      
      var is_hp_seq = false;

      const parsed_comments = {}
      const all_comments = header.filter(entry => entry.tag === 'CO').map((data) => {
        let um_id = ''
        let value = ''
        data.data.forEach((d)=> {
          if(d.tag === 'UM'){
            um_id = d.value
          }
          else {
            value = d.value
            if(value == 'HP_SEQ') {
              is_hp_seq = true
              fileDict['HP_SEQ'] = {
                'filename':`${filename}`
              }
            }
          }
        })
        parsed_comments[um_id] = value
      })

      if(is_hp_seq){
        continue
      }

      const readGroups = header
            .filter(entry => entry.tag === 'RG')
            .map((entry) => {
              var group_name = ''
              var node_name = ''
              var um = []
              var haplotype_proportion = ''
              var haplotype_lineage = ''
              var uncertain_haplotype = []
              var coverage_proportion = ''
              var haplotype_distance = ''

              entry.data.forEach((d)=>{
                if(d.tag === 'ID'){
                  group_name = d.value
                }
                else if(d.tag === "DS") {
                  node_name = d.value.replace('Node:','')
                }
                else if(d.tag === 'UM'){
                  um_ids = d.value.replace('Z:','').split(',')
                  um = um_ids.map((u) => {
                    return { [u]: parsed_comments[u] };
                  });
                } else if(d.tag === 'HS'){
                  haplotype_proportion = d.value.replace('Z:', '')
                } else if (d.tag == 'HL'){
                  haplotype_lineage = d.value.replace('Z:', '')
                }else if (d.tag == 'UH'){
                  uncertain_haplotype = d.value.replace('Z:','').split(',')
                } else if (d.tag == 'HC'){
                  coverage_proportion = d.value.replace('Z:', '')
                } else if (d.tag == 'HD'){
                  haplotype_distance = d.value.replace('Z:', '')
                }
              })
              fileDict[node_name] = {
                "filename": `${filename}`,
                'groupname':group_name,
                [group_name]: um,
                "HS": haplotype_proportion, 
                'HL':haplotype_lineage,
                'UH': uncertain_haplotype,
                'HC': coverage_proportion,
                'HD': haplotype_distance,
              }
            });

    }catch (error){
      console.log("error", error)
    }
  }
  return fileDict;
}

function getFullExtension(filename) {
  if (filename.endsWith('.jsonl.gz')) return '.jsonl.gz';
  if (filename.endsWith('.jsonl')) return '.jsonl';
  // fallback to default
  return path.extname(filename);
}

const loadData = async () => {
  await waitForTheImports();

  const basename = path.basename(command_options.data_file);

  // const stats = fs.statSync(command_options.data_file)
  const stat_size = await getFileSizeInMB(command_options.data_file)

  const fileExt = getFullExtension('data.jsonl.gz'); // returns '.jsonl.gz'
  if (![".jsonl", ".jsonl.gz"].includes(fileExt)) {
    throw new Error(`Invalid file extension: ${fileExt}. Expected .jsonl or .jsonl.gz.`);
  }

  await loadTaxonium(command_options.data_file);

  globalTaxoniumMeta = {
    path: basename,
    size: stat_size
  }; 
  console.log("globalTaxoniumMeta", globalTaxoniumMeta)


  // set a timeout to start listening
  setTimeout(() => {
    console.log("Starting to listen");
    startListening();
    // logStatusMessage({
    //   status: "loaded",
    // });
  }, 10);
};

loadData();