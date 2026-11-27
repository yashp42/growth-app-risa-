import assert from 'node:assert/strict';
import test from 'node:test';
import { usesUploadedContext } from '../server/llm/uploadedContext.ts';
for(const q of ['Which row is largest?','What about those sponsors?','Why is that the largest?','Is that actually collected cash?'])test('[MOCKED] uploaded-source follow-up stays on the selected data: '+q,()=>assert.equal(usesUploadedContext(q,'Summarise the uploaded Reviewer file',['Reviewer file']),true));
test('[MOCKED] a new operational request leaves upload scope, while explicit upload names still win',()=>{
 assert.equal(usesUploadedContext('Show deals in our current pipeline','Summarise the uploaded Reviewer file',['Reviewer file']),false);
 assert.equal(usesUploadedContext('How much cash have we collected?','Summarise the uploaded Reviewer file',['Reviewer file']),false);
 assert.equal(usesUploadedContext('Find the largest value in Reviewer file','Unrelated prior question',['Reviewer file']),true);
});
