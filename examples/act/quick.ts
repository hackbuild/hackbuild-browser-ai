import { buildVocabulary, createDirector, grammar, promptBlock } from "@hackbuild/act";

// the names this avatar can realize
const vocab = buildVocabulary({ expressions: ["happy", "sad", "surprised"], gestures: ["wave", "nod"], postures: ["sit"] });

// add the tag list to the system prompt; pass the grammar where the runtime takes one
const system = `You are Ada.\n\n${promptBlock(vocab)}`;
const gbnf = grammar(vocab, "gbnf");
console.log(system, gbnf);

// strip tags from the streamed reply and fire each cue when the voice reaches it
const director = createDirector({ vocab, mode: "hybrid", fire: (cue) => console.log(cue.kind, cue.name, "at", cue.at) });
director.begin();
let spoken = "";
for (const chunk of ["[happy] Hello there, ", "*waves* nice to ", "see you."]) spoken += director.feed(chunk).text;
spoken += director.finish().text;

// speech reports character offsets in the visible text it was given
director.reached(spoken.length);
