// chrome.runtime.onMessage.addListener(

// (req,sender,sendResponse)=>{

// if(req.action!="extract")
// return;

// const data={

// provider:"OpenAI",

// llm:"ChatGPT",

// sessionId:ChatParser.getConversationId(),

// url:location.href,

// title:document.title,

// timestamp:new Date().toISOString(),

// messages:ChatParser.getMessages()

// };

// sendResponse(data);

// });

// content.js
// Runs on ChatGPT / Gemini / Claude pages.
// Listens for "extract" from popup → returns parsed conversation data.
// ChatParser is provided by utils/parser.js (loaded before this file).

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

    if (req.action !== "extract") return;

    const data = {
        provider:  "OpenAI",
        llm:       "ChatGPT",
        sessionId: ChatParser.getConversationId(),
        url:       location.href,
        title:     document.title,
        timestamp: new Date().toISOString(),
        messages:  ChatParser.getMessages(),
    };

    sendResponse(data);
});