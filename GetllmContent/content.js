chrome.runtime.onMessage.addListener(

(req,sender,sendResponse)=>{

if(req.action!="extract")
return;

const data={

provider:"OpenAI",

llm:"ChatGPT",

sessionId:ChatParser.getConversationId(),

url:location.href,

title:document.title,

timestamp:new Date().toISOString(),

messages:ChatParser.getMessages()

};

sendResponse(data);

});