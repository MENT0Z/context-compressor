// class ChatParser {
//   static getConversationId() {
//     let arr = location.pathname.split("/");
//     return arr[arr.length - 1];
//   }

//   static getMessages() {
//     let msgs = [];
    
//     const turndownService = new TurndownService({
//       headingStyle: 'atx',
//       codeBlockStyle: 'fenced'
//     });

//     // FIX: Tells Turndown to drop UI clutter like buttons and icons entirely
//     turndownService.remove(['button', 'svg', 'script', 'style']);

//     document
//       .querySelectorAll("[data-message-author-role]")
//       .forEach((e) => {
//         let contentNode = e.querySelector('.markdown, .prose') || e;
//         let markdownText = turndownService.turndown(contentNode);

//         msgs.push({
//           role: e.dataset.messageAuthorRole,
//           text: markdownText.trim(),
//           timestamp: new Date().toISOString()
//         });
//       });

//     return msgs;
//   }
// }
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