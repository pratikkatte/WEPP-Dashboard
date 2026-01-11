export function getDefaultSearch(config, text, hs_value, hl_value, hc_value, hd_value) {
    const key = Math.random().toString(36).substring(2, 15);

    if (config && config.defaultSearch) {
      return config.defaultSearch;
    }

    console.log("hd_value", hl_value, hd_value)
    return {
      key,
      type: "name",
      method: "text_exact",
      text,
      gene: "S",
      position: 484,
      new_residue: "any",
      min_tips: 0,
      hl_value: String(hl_value),
      hd_value: String(hd_value),
      ...(hs_value ? { hs_value: (parseFloat(hs_value) * 100).toFixed(3) } : {}),
      ...(hc_value ? { hc_value: (parseFloat(hc_value) * 100).toFixed(3) } : {})

    };
  }
  