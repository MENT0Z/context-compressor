// content.js
// Runs on ChatGPT / Gemini / Claude pages.
// Listens for "extract" from popup → returns parsed conversation data.
// ChatParser is provided by utils/parser.js (loaded before this file).

// ─── Auto-trigger on conversation change ────────────────────────────────────
let _lastConvId = ChatParser.getConversationId();

function _onConversationChange() {
    const newId = ChatParser.getConversationId();
    if (newId === _lastConvId) return;
    _lastConvId = newId;

    // Notify popup that the conversation changed so it can reset UI
    chrome.runtime.sendMessage({ action: "conversationChanged", conversationId: newId })
        .catch(() => {}); // popup may not be open, that's fine
}

// Watch for SPA URL changes (ChatGPT/Claude/Gemini are all SPAs)
// Navigation via history.pushState doesn't fire popstate, so we patch it
const _origPushState = history.pushState.bind(history);
history.pushState = (...args) => {
    _origPushState(...args);
    _onConversationChange();
};
window.addEventListener("popstate", _onConversationChange);

// Also watch DOM mutations as a backup (some SPAs don't use pushState)
new MutationObserver(_onConversationChange).observe(document.body, {
    childList: true,
    subtree: false, // only top-level children to avoid firing on every keypress
});


// ─── Message extraction ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action !== "extract") return;

    // Must return true FIRST to keep the message channel open for async reply
    (async () => {
        try {
            const messages = await ChatParser.getMessages(); // was missing await

            const platform = ChatParser.getPlatform();
            const providerMap = {
                chatgpt: { provider: "OpenAI",  llm: "ChatGPT" },
                gemini:  { provider: "Google",  llm: "Gemini"  },
                claude:  { provider: "Anthropic", llm: "Claude" },
            };
            const { provider, llm } = providerMap[platform] ?? { provider: "Unknown", llm: "Unknown" };

            sendResponse({
                provider,
                llm,
                sessionId:  ChatParser.getConversationId(),
                url:        location.href,
                title:      document.title,
                timestamp:  new Date().toISOString(),
                messages,
            });
        } catch (err) {
            sendResponse({ error: err.message, messages: [] });
        }
    })();

    return true; // ← keeps channel open for the async sendResponse above
});