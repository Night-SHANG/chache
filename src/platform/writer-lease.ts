export interface WriterLease { status:'held'|'busy'|'unsupported'; release():void }
export async function acquireBrowserWriter(locks:LockManager|undefined):Promise<WriterLease> {
 if(!locks)return {status:'unsupported',release(){}};
 return new Promise(resolve=>{
  let answered=false;
  try {
   const requested=locks.request('warehouse.account.s1.writer',{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock){answered=true;resolve({status:'busy',release(){}});return;}
    await new Promise<void>(release=>{answered=true;let released=false;const lease:WriterLease={status:'held',release(){if(!released){released=true;lease.status='busy';release();}}};resolve(lease);});
   });
   Promise.resolve(requested).catch(()=>{if(!answered)resolve({status:'unsupported',release(){}});});
  }catch {resolve({status:'unsupported',release(){}});}
 });
}
