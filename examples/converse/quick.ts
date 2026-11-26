import { scripted } from "@hackbuild/chat";
import { createConversation, exportSession } from "@hackbuild/converse";

// any ChatEngine from @hackbuild/chat fits; the scripted one runs no model
const engine = scripted({ replies: ["[wave] hi, ready for a walk"] });

// one conversation with a system text and a greeting that is never sent
const conv = createConversation({ engine, now: () => Date.now(), system: "you are a dog", greeting: "woof. what are we doing" });

// stream the reply text as it arrives
conv.on((e) => {
  if (e.type === "text") console.log("so far:", e.text);
});

// send a turn, then look at the next request and the saved session
const reply = await conv.send("walk time");
console.log("reply:", reply?.content, "next request:", conv.request().length, "messages");
console.log(exportSession(conv.session));
