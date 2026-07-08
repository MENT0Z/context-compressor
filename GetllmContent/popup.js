document.getElementById("extract").onclick = async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { action: "extract" }, (res) => {
    // Check if the content script is missing/unreachable
    if (chrome.runtime.lastError) {
      document.getElementById("result").textContent = 
        "Error: Connection failed. Please refresh the page to load the extension.";
      console.error(chrome.runtime.lastError.message);
      return;
    }

    if (res) {
      document.getElementById("result").textContent = JSON.stringify(res, null, 2);
    } else {
      document.getElementById("result").textContent = "No data returned.";
    }
  });
};