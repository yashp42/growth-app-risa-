/** Carry an explicit uploaded-data source into short follow-ups, never into a new CRM request. */
export function usesUploadedContext(question:string,previousQuestion:string,names:string[]):boolean {
 const mentions=(s:string)=>/\b(uploaded|imported|csv|custom dataset|my file)\b/i.test(s)||names.some(n=>n.trim().length>1&&s.toLowerCase().includes(n.toLowerCase()));
 if(mentions(question))return true;
 if(/\b(in (?:our|the) (?:live |current )?pipeline|in (?:our|the) (?:live |current )?CRM|active edition|our current campaigns)\b/i.test(question))return false;
 return /^(?:and\b|why\b|what about\b|how about\b|which (?:row|one|of them|of those)\b|what(?:'s| is) (?:its|their)\b|is that\b|tell me more\b)/i.test(question.trim())&&mentions(previousQuestion);
}
