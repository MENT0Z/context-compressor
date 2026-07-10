class ChatParser{

static getConversationId(){

let arr=location.pathname.split("/");

return arr[arr.length-1];

}

static getMessages(){

let msgs=[];

document
.querySelectorAll("[data-message-author-role]")
.forEach((e)=>{

msgs.push({

role:e.dataset.messageAuthorRole,

text:e.innerText.trim(),

timestamp:new Date().toISOString()

});

});

return msgs;

}

}