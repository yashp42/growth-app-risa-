import assert from 'node:assert/strict';
import test from 'node:test';
import { opportunityStart } from '../server/opportunityInput.ts';

test('[MOCKED] entered starting amount, owner and stage survive the real nested form shape',()=>{
 assert.deepEqual(opportunityStart({initial_stage:{stage:'proposal_sent',owner_member_id:'SIM-PART',proposed_value:76543}}),{stage:'proposal_sent',ownerMemberId:'SIM-PART',proposedValue:76543});
});
test('[MOCKED] flat API requests retain zero and tolerate matching compatibility fields',()=>{
 assert.deepEqual(opportunityStart({proposed_value:0,owner_member_id:'SIM-LEAD'}),{stage:'prospecting',ownerMemberId:'SIM-LEAD',proposedValue:0});
 assert.equal(opportunityStart({proposed_value:76543,initial_stage:{proposed_value:76543}}).proposedValue,76543);
});
test('[MOCKED] conflicting nested and flat amount/owner fields and malformed stage are rejected',()=>{
 for(const raw of [{proposed_value:1,initial_stage:{proposed_value:2}},{owner_member_id:'A',initial_stage:{owner_member_id:'B'}},{initial_stage:'negotiating'},{initial_stage:[]}])assert.throws(()=>opportunityStart(raw));
});
