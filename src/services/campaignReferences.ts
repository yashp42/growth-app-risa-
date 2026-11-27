import { apiFetch } from './authSession';
export interface CampaignChannel { channel_id:string; name:string; label:string; is_active:boolean }
export interface CampaignBet { bet_id:string; name:string }
/** IDs must come from the database that will enforce the foreign key. */
export async function fetchCampaignReferences(editionId:string,recordClass:string,signal?:AbortSignal) {
  const query='?'+new URLSearchParams({edition_id:editionId,record_class:recordClass});
  const read=async(path:string)=>{
    const r=await apiFetch(path+query,{signal});
    if(!r.ok)throw Error('Could not load campaign reference options. Close and reopen this form to retry.');
    return await r.json();
  };
  const [c,b]=await Promise.all([read('/api/reference/channels'),read('/api/reference/bets')]);
  if(!Array.isArray(c.channels)||!Array.isArray(b.bets))throw Error('Campaign reference options were incomplete.');
  const channels:CampaignChannel[]=c.channels.filter((v:any)=>typeof v.channel_id==='string').map((v:any)=>({channel_id:v.channel_id,name:v.name??v.channel_id,label:v.label??v.name??v.channel_id,is_active:v.is_active!==false}));
  const bets:CampaignBet[]=b.bets.filter((v:any)=>typeof v.bet_id==='string').map((v:any)=>({bet_id:v.bet_id,name:v.name??v.bet_id}));
  if(!channels.length)throw Error('No channels are available in this workspace.');
  return {channels,bets};
}
