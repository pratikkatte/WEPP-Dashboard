import SearchItem from "./SearchItem";
import { FaSearch, FaLink, FaTrash, FaArrowUp, FaArrowDown} from "react-icons/fa";
import { getDefaultSearch } from "../utils/searchUtil";

import { useCallback, useState } from "react";
import { Button } from "../components/Basic";
import { formatNumber } from "../utils/formatNumber";
import { ClipLoader } from "react-spinners";
import DisplayHaplotype from './DisplayHaplotypes'
import Modal from "react-modal";


function SearchTopLayerItem({ singleSearchSpec, myKey, search, config, uncertainNodes }) {
  const myLoadingStatus = search.searchLoadingStatus[myKey];
  const [permaLinkModalOpen, setPermaLinkModalOpen] = useState(false);
  const this_result = search.searchResults[myKey];
  const [isOpen, setIsOpen] = useState(false);
  const [issearched, setIssearched] = useState(false);

  const num_results =
    this_result && this_result.result
      ? this_result.result.total_count
      : "Loading";

  const getMyIndex = useCallback(() => {
    const indexes = search.searchSpec.reduce((acc, item, idx) => {
      if (item.key === myKey) {
        acc.push(idx);
      }
      return acc;
    }, []);
    
    return indexes;
  }, [search.searchSpec, myKey]);

  const setThisSearchSpec = useCallback(
    (thisSpec) => {
      // find the index of the item in the searchSpec array
      const index = getMyIndex()
   
      // make a copy of the searchSpec array
      // replace the item at the index with the new item
      const newSearchSpec = [...search.searchSpec]

      newSearchSpec[index] = thisSpec;
      // set the new searchSpec array
      search.setSearchSpec(newSearchSpec);
    },
    [search, getMyIndex]
  );

  const showUncertainNodes = useCallback(()=>{
    const index = getMyIndex()
    var keys = search.searchUncertain_nodes(uncertainNodes, index);
    return keys

  },[search.searchSpec, singleSearchSpec, search.searchesEnabled])

  const enabled =
    search.searchesEnabled[myKey] !== undefined
      ? search.searchesEnabled[myKey]
      : false;


  const thecolor = search.getLineColor(getMyIndex());

  return (
    <>
      <Modal
        isOpen={permaLinkModalOpen}
        onRequestClose={() => setPermaLinkModalOpen(false)}
      >
        A permalink that will link to a tree zoomed to this search is below:
        <br />
        <textarea
          onclick="this.focus();this.select()"
          value={window.location.href + "&zoomToSearch=" + getMyIndex()}
          className="border p-2 m-4 text-xs w-full bg-neutral-100"
          readOnly={true}
        ></textarea>
      </Modal>
      <div className="border-gray-100 border-b pb-2">
        <input
          name="isGoing"
          type="checkbox"
          style={{
            outline:
              enabled && num_results > 0
                ? `2px solid rgb(${thecolor[0]},${thecolor[1]},${thecolor[2]})`
                : "0px",
            outlineOffset: "2px",
          }}
          className="m-3 inline-block"
          checked={enabled}
          onChange={(event) => search.setEnabled(myKey, event.target.checked)}
        />
        <SearchItem
          config={config}
          singleSearchSpec={singleSearchSpec}
          setThisSearchSpec={setThisSearchSpec}
        />

        <div className="flex justify-between items-center mt-2">
          <div className="text-black pr-2 text-sm">
            {" "}
            {num_results !== "Loading" && (
              <>

                {formatNumber(num_results)} result{num_results === 1 ? "" : "s"}
              </>
            )}{" "}

            {num_results > 0 && (
              <>
                <Button
                  className="inline-block bg-gray-100 text-xs mx-auto h-5 rounded border-gray-300 border  text-gray-700 "
                  onClick={() => {
                    const index = getMyIndex();
                    search.setZoomToSearch({ index });
                  }}
                  title="Zoom to this search"
                >
                  <FaSearch />
                </Button>
                {uncertainNodes && uncertainNodes.length > 0 && (
                  <DisplayHaplotype 
                  showUncertainNodes={showUncertainNodes} 
                  search={search}
                  // singleSearchSpec={singleSearchSpec}
                />
                )}
                
                {singleSearchSpec?.hs_value && (
                  <div className="text-sm">
                    <span className="font-semibold">Proportion:</span> {singleSearchSpec.hs_value}%
                    <span className="font-semibold"> Lineage:</span> {singleSearchSpec.hl_value}
                    <span className="font-semibold"> Coverage:</span> {singleSearchSpec.hc_value}%
                  </div>
                )}
                {
                  // check if window href includes 'protoUrl'
                  (window.location.href.includes("protoUrl") ||
                    window.location.href.includes("treeUrl") ||
                    window.location.href.includes("cov2tree.org") ||
                    window.location.href.includes("backend")) &&
                    config &&
                    !config.disable_permalink && (
                      <Button
                        className="inline-block bg-gray-100 text-xs mx-auto h-5 rounded border-gray-300 border text-gray-700"
                        onClick={() => {
                          setPermaLinkModalOpen(true);
                        }}
                        title="Get permalink"
                      >
                        <FaLink />
                      </Button>
                    )
                }{" "}
              </>
            )}
            {myLoadingStatus === "loading" && (
              <ClipLoader size={12} color="#444444" className="mr-3" />
            )}
          </div>
          <div>
            <Button
              title="Delete this search"
              onClick={() => search.deleteTopLevelSearch(myKey)}
            >
              <FaTrash className="text-gray-600" />
            </Button>
          </div>

        </div>
        {uncertainNodes && uncertainNodes.length > 0 && (
        <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      padding: '10px',
      marginTop: '10px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#fafafa'
    }}>
     
        <>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            cursor: 'pointer'
          }} 
            onClick={() => setIsOpen(!isOpen)}
          >
            <strong style={{ fontSize: '14px', color: '#333' }}>Uncertain Haplotypes</strong> (Maximum Nucleotide distance: {singleSearchSpec.hd_value})
            {isOpen ? <FaArrowUp size={14} /> : <FaArrowDown size={14} />}
          </div>
          {isOpen && (
            <div style={{ marginTop: '8px', paddingLeft: '5px' }}>
              {uncertainNodes.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#777' }}>No uncertain nodes.</p>
              ) : (
                uncertainNodes.map((node, index) => (
                  <p key={index} style={{ margin: '5px 0', fontSize: '13px', color: '#555' }}>
                    {node}
                  </p>
                ))
              )}
            </div>
          )}
        </>

        
    </div>
  )}
      </div>
    </>
  );
}

export default SearchTopLayerItem;
