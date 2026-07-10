// background.js — Service worker
// Imports all utils so they share the same global scope (classic importScripts).
// Listens for two messages from popup.js:
//   { action: "process", messages: [...] }  → runs extractor, returns result
//   { action: "saveKey", key: "...", value: "..." } → saves API key to storage

importScripts(
    "utils/modelTypes.js",
    "utils/chunker.js",
    "utils/scorer.js",
    "utils/llm_extractor.js"
);

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

    if (req.action === "process") {
        // Run the extractor async and reply when done
        runExtractor(req.messages)
            .then(result => sendResponse({ ok: true, data: result }))
            .catch(err  => sendResponse({ ok: false, error: err.message }));

        return true; // keeps the message channel open for async response
    }

    if (req.action === "saveKey") {
        chrome.storage.sync.set({ [req.key]: req.value }, () =>
            sendResponse({ ok: true })
        );
        return true;
    }

});