import React, { useState, useRef, useEffect, useCallback } from "react";
import TaxoniumBit from "./components/TaxoniumBit";
import { getDefaultSearch } from "./utils/searchUtil.js";

import makeTracks from './tracks.jsx';
import makeAssembly from './assembly.jsx';
import makeSession from './defaultSession.jsx'
import addTrack  from './utils/TrackUtils.jsx'
import { Header } from './utils/UIUtils.jsx'
import FileUpload from './utils/uploadUtils.jsx'
import DashboardPlugin from './plugins'
import SplitPane from 'react-split-pane';
import { MdArrowBack, MdArrowForward, MdArrowUpward } from "react-icons/md";
import useDashboardConfig from './config.js'
import {createRoot, hydrateRoot } from 'react-dom/client'
import useConfirmOnBack from './utils/useConfirmOnBack.ts'

import './App.css'

import {
  createViewState,
  JBrowseLinearGenomeView,
} from '@jbrowse/react-linear-genome-view'

const default_query = {};

default_query.backend = null;

const createDefaultSearch = (mark_nodes, hap_lin, hc_lin, hd_lin) => {
  
  return Object.keys(mark_nodes).map(node => {
    return getDefaultSearch(null, node, mark_nodes[node], hap_lin[node], hc_lin[node], hd_lin[node]);
  })
}

function App() {
  // Import taxonium-component
  useEffect(() => {
    import("taxonium-component");
  }, []);


  
  const [viewState, setViewState] = useState();
  const clickedNodeRef = useRef(null);
  const mark_nodeRef = useRef(null);
  const trackIDsRef = useRef([]);
  const [createTrack, setCreateTrack] = useState(null)
  const [JBrowseOpen, setJBrowseOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(false);
  const [paneSize, setPaneSize] = useState('98%');
  const [uncertainNodes, setUncertainNodes] = useState(null);

  
  const [patches, setPatches] = useState(null);
  
  const [backupQuery, setBackupQuery] = useState(default_query);
  const backupUpdateQuery = useCallback((newQuery) => {
    setBackupQuery((oldQuery) => ({ ...oldQuery, ...newQuery }));
  }, []);
  
  const query = backupQuery; // query
  const updateQuery = backupUpdateQuery;

const defaultConfig = {"project_name":"uploads",
                      "reference_name":"NC_045512v2",
                      "taxonium_file_path": "taxonium.jsonl",
                      "start": 0,
                      "end":29903
                    }
  const [projectName, setProjectName] = useState(defaultConfig); 
  
  const config = useDashboardConfig(projectName);

  useEffect(() => {
    // Do something with config or projectConfig if needed
    // (But DO NOT call useDashboardConfig here)
    console.log("Config updated:", config);
    trackIDsRef.current = []
    setPatches(null)
  }, [config]);

  const toggleJBrowse = useCallback((input_jbrowse) => {
    setJBrowseOpen(() => {
      // const newState = !prev;
      const newState = input_jbrowse
      setPaneSize(newState ? '50%' : '98%');
      return newState;
    });
  }, [JBrowseOpen]);

  useEffect(() => {
    const state = createViewState({
      assembly: makeAssembly(config),
      tracks: [],
      defaultSession: makeSession(config, []),
      plugins: [DashboardPlugin],
      onChange: patch => {
        setPatches(previous => previous + JSON.stringify(patch) + '\n')
      },
      configuration: {
        rpc: {
          defaultDriver: 'WebWorkerRpcDriver',
        },
      },
      makeWorkerInstance: () => {
        return new Worker(new URL('./rpcWorker', import.meta.url), {
          type: 'module',
        })
      },
      hydrateFn: hydrateRoot,
      createRootFn: createRoot,
    })
    setViewState(state)
    trackIDsRef.current = []
  }, [config, projectName]);

  useEffect(() => {
    const annotationTrackId = "nextstrain-annotations"
    if (!trackIDsRef.current.includes(annotationTrackId) && viewState && config.REF_NAME?.includes("NC_045512")) {
      const geneTracks = makeTracks(config)
      const annotationTrack = geneTracks.find(t => t.trackId === annotationTrackId)
      
      if (annotationTrack) {

        viewState.session.addTrackConf(annotationTrack)
        viewState.session.view.showTrack(annotationTrackId)
        trackIDsRef.current.push(annotationTrackId)
      }
    }
  }, [viewState])
  

  useEffect(() => {
    if (createTrack && clickedNodeRef.current) {
      if (viewState && config && selectedFile) {
        addTrack(clickedNodeRef, selectedFile, trackIDsRef, viewState, config);
      }
      setCreateTrack(false);
    }
  }, [createTrack, viewState, config, selectedFile]);

    const onClickNode = useCallback((selectedNode) => {
    if ( selectedNode && mark_nodeRef.current.includes(selectedNode.nodeDetails.name) && !createTrack){
            clickedNodeRef.current = selectedNode
            setCreateTrack(true);
            toggleJBrowse(true)
          }

    }, [mark_nodeRef]);

    useConfirmOnBack({
      enabled: !!selectedFile, // only trap when a session/file is loaded
      message: 'Do you want to leave and lose this session?',
      onConfirm: () => {
    
        // Vanilla:
        setSelectedFile(false);
        // setUncertainNodes(null);
        // setBackupQuery(default_query);
        setProjectName(defaultConfig);
        // setPatches(null);
        // setViewState(null);
        // clickedNodeRef.current = null;
        // mark_nodeRef.current = null;
        trackIDsRef.current = [];
        setCreateTrack(null);
        setJBrowseOpen(false);
        setPaneSize('98%');
        window.location.href = '/';
        
      },
    });

  //   useEffect(() => {
  //     const handlePopState = () => {
  //       if (selectedFile) {
  //         const confirmLeave = window.confirm(
  //           "Do you want to leave and lose this session?"
  //         );
  //         if (!confirmLeave) {
  //           // 👇 Push a new dummy state again to intercept future back presses
  //           window.history.pushState(null, '', window.location.href);
  //         } else {
  //            // Allow back navigation
  //           window.removeEventListener('popstate', handlePopState);
  //           window.history.back(); // proceed with browser history
  //         }
  //       }
  //     };
    
  //     // Initial trap
  //     window.history.pushState(null, '', window.location.href);
  //     window.addEventListener('popstate', handlePopState);
    
  //     return () => {
  //       window.removeEventListener('popstate', handlePopState);
  //     };
  //   }, [selectedFile]);    

  //   if (!viewState) {
  //     return null
  // }

  return (
    <>

      <div className="flex flex-col h-screen ">
          < Header/>
          <br />
            {!selectedFile ? 
              <div>
                <FileUpload 
                setSelectedFile={setSelectedFile} 
                createDefaultSearch={createDefaultSearch} 
                mark_nodeRef={mark_nodeRef} 
                updateQuery={updateQuery} 
                config={config}
                setProjectName={setProjectName}
                setUncertainNodes={setUncertainNodes}
                />
              </div>
          :
                <SplitPane
                  split="vertical"
                  minSize={0}
                  // defaultSize="70%"
                  size={paneSize}

                  style={{ height: "100vh" }}
                  >
                    {/* Left Pane: TaxoniumBit */}
                    <div className="h-full w-full flex flex-col overflow-hidden">
                    <TaxoniumBit
                      backendUrl={`${config.TAXONIUM_BASE}`}
                      query={query}
                      updateQuery={updateQuery}
                      onClickNode={onClickNode}
                      bamInformation={selectedFile}
                      uncertainNodes={uncertainNodes}
                    />
                </div>

          {/* Right Pane: JBrowse */}
          <div className="h-full w-full overflow-auto jbrowse-display">
            <button
            onClick={() => toggleJBrowse(!JBrowseOpen)}
            className="jbrowse-toggle"
            style={{
              display:'flex',
              marginLeft: !JBrowseOpen ? 'auto' : 'inherit',
            }}
          >
            {JBrowseOpen ? <MdArrowForward/> : <MdArrowBack/>}
          </button>
          {JBrowseOpen && (
            <JBrowseLinearGenomeView viewState={viewState}/>
          )}
          </div>
        </SplitPane>
      }
    </div>

  </>
);
}
export default App;