import axios from 'axios';
import React, { useEffect, useState } from 'react';




const FileUpload = ({setSelectedFile, createDefaultSearch, mark_nodeRef, updateQuery, config, setProjectName, setUncertainNodes}) => {
  

  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(null);

  const [uploadProgress, setuploadProgress] = useState(0);

  const [results, setResults] = useState(null);
  const [taxonium_file, setTaxoniumFile] = useState(null);


  useEffect(()=> {
    if(results==null){
      console.log("config", `${config.PROJECTS}`)
      axios.post(`${config.PROJECTS}`)
        .then((response) => {
      console.log("result", response.data.results)
      setResults(response.data.results);
      setTaxoniumFile(response.data.taxonium_file);
    })
    .catch((error) => {
      console.error("Error fetching results", error);
    });
    }
  }, [])

    const handleFileChange = (event) => {
      setUploadedFile(Array.from(event.target.files))
      };
    
    const handleFileUpload = async (ev) => {
      ev.preventDefault();
      setUploading(true)

      if (!uploadedFile) {
          alert('Please select a file first');
          return;
        }
        const data = new FormData()

        uploadedFile.forEach(file => data.append('files', file)); // key must match 'files'

       try {
          const p_config = {
            headers: {
              'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent) => {
              const { loaded, total } = progressEvent;
              setuploadProgress(Math.round((loaded / total) * 100));
            },
          };
          console.log(`server url ${config.UPLOAD}`)
          const response = await axios.post(
            `${config.UPLOAD}`,
            data,
            p_config,
          );
          
          console.log("response", response)
          if (response.status === 200) {
            
            setUploading(false)
            const selected_nodes = response.data.response
            var project_config = response.data.config
            setProjectName(project_config)
            handleFileProcessing(selected_nodes)

          }
          if (response.status == 400 ){
            console.log(response)
            alert(response.status)
          }
        }catch (error){
          setUploading(false);
          console.log("error", error);
        
          if (error.response) {
            if (error.response.status === 400) {
              alert(error.response.data.error);
            } else {
              alert(error.response.status);
            }
          } else {
            alert('Could not upload file. Network error or CORS error');
          }
      }
    };

    const handleResultsClick = async (ev, idx) => {
      ev.preventDefault();
      let tax_loaded = false;

        setLoading(idx);
        console.log("load url", `${config.LOAD_TAX}${results[idx]}`);
        
        try {
          const response =  await axios.get(`${config.LOAD_TAX}${results[idx]}`);
          if (response.status === 200) {
            console.log("load tax", response);
            tax_loaded = true
            setLoading(null);  
          } else {
            console.log("error", response);
            alert('Could not load the taxonium file.');
            setLoading(false);
            tax_loaded = false;
          }
        } catch (error) {
          console.log("axios error", error);
          setLoading(null);
          tax_loaded = false;
          alert('Could not load the taxonium file.');
        }

        if(tax_loaded){
          try {
            console.log("moving forward")
            const response =  await axios.post(
                  `${config.RESULT}${results[idx]}`
            )
            // console.log('response', response)
    
            if (response.status === 200) {
              const selected_nodes = response.data.response
              var project_config = response.data.config
    
              // console.log("config updating",project_config )
              setProjectName(project_config)
              handleFileProcessing(selected_nodes)
            }
            if (response.status == 400 ){
              console.log(response)
              alert(response.status)
            }
          } catch (error){
            console.log("result error", error)
          }  
        }
        
    }
    
      const handleFileProcessing = (filenames_nodes) => {

        const keysToExclude = ['HP_SEQ']; 
        const nodes = Object.keys(filenames_nodes).filter(key => !keysToExclude.includes(key));
        
        mark_nodeRef.current = nodes;

        const haplotype_prop = {}
        const haplotype_lineage = {}
        const uncertain_nodes = {}
        const hc_lineage = {}
        const hd_lineage = {}
    
        const zoom_to_indexes = [];
        for (let i = 0; i < nodes.length; i++) {
            zoom_to_indexes.push(i.toString());
            haplotype_prop[nodes[i]] = filenames_nodes[nodes[i]]['HS']
            haplotype_lineage[nodes[i]] = filenames_nodes[nodes[i]]['HL']
            uncertain_nodes[nodes[i]] = filenames_nodes[nodes[i]]['UH']
            hc_lineage[nodes[i]] = filenames_nodes[nodes[i]]['HC']
            hd_lineage[nodes[i]] = filenames_nodes[nodes[i]]['HD']
        }
        const default_search = createDefaultSearch(haplotype_prop, haplotype_lineage, hc_lineage, hd_lineage);

        const query = {
              srch: JSON.stringify(default_search),
              enabled: JSON.stringify(Object.fromEntries(default_search.map(value => [value.key, true]))),
              backend: "",
              xType: "x_dist",
              zoomToSearch: zoom_to_indexes,
              mutationTypesEnabled: JSON.stringify({ aa: true, nt: true }),
              treenomeEnabled: false,
          };
        updateQuery(query)
        setSelectedFile(filenames_nodes);
        setUncertainNodes(uncertain_nodes);
    }
    
    return (
      <div style={{maxWidth: '90%', margin: '0 auto'  }}>

        <div style={{ background: '#f0f0f0', padding: '20px', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>
            <p style={{ textAlign: 'center', fontSize: '16px', color: '#333', maxWidth:'90%',margin: '10px auto' }}>
            This dashboard provides insights into wastewater sequencing data by enabling interactive estimation of haplotype and lineage proportions, detection of unaccounted (novel) alleles, and read-level analysis.
            </p>
            <p style={{ textAlign: 'center', fontSize: 'small', color: '#333', maxWidth:'90%',margin: '10px auto' }}>
            <strong>Note:</strong> Please upload your BAM and reference files with their index files for complete analysis or click on one of the results to explore.
            </p>

            <div className='flex' style={{ justifyContent: "center", alignItems: "center", margin: '30px auto'}}>
                <input type="file" 
                onChange={handleFileChange} style={{ padding: '10px', margin: '5px', border: '1px solid #ccc', borderRadius: '5px' }} multiple />
                <button 
                  disabled={uploading}
                  onClick={handleFileUpload} 
                  style={{ padding: '10px 20px', margin: '5px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Upload</button>
                {uploading && (
            <p>{uploadProgress}%</p>

        )} 
            <br/>
            </div>
            <div style={{ textAlign: 'center', fontSize: 'small' }}>
                <span>Loaded Taxonium file: <strong>{taxonium_file}</strong></span>
            </div>
            
        </div>   
        {results && results.length>0 && (
          <div className="flex flex-col space-y-3 pt-6">
            <div className="flex flex-row items-center">
              <div className="flex-1 border-t border-gray-300"></div>
              <div className="px-2 text-gray-500 text-sm">results</div>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>
            <div className="flex flex-wrap gap-4 mt-6">
            {results.map((result, index) => (
  <div key={index} className="flex flex-col">
    <button
      style={{
        background: '#f2f0f0', // fixed typo
        padding: '10px',
        display: 'flex',
        // flexDirection: 'column',
        borderRadius: '5px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '120px',
        border: '1px solid gray',
        textAlign: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
      onClick={(ev) => handleResultsClick(ev, index)}
    >
      {result}
      {loading === index && (
        <span
          className="spinner"
          style={{
            width: '15px',
            display: 'flex',
            height: '15px',
            border: '2px solid #ccc',
            borderTop: '3px solid #333',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginLeft: '10px',
          }}
        />
      )}
    </button>
    {loading === index && (
      <span style={{ marginTop: '4px',display: 'flex',
        flexDirection: 'column', color: '#888', textAlign: 'center' }}>
        Loading taxonium
      </span>
    )}
  </div>
))} 
            </div>
            </div>
          )}
          </div>
        );
      };

  export default FileUpload
