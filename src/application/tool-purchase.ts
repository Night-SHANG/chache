import type {AccountService,AccountRequest} from './account-service.ts';
import type {ViewState} from '../presentation/view-types.ts';
import type {AccountSnapshot,ItemId} from './account-types.ts';
import {ITEM_PRICES} from './economy.ts';
import {shopPrice} from '../shared/build-policy.ts';
/** Read-only shop projection. The account transaction independently revalidates every value. */
export function toolPurchaseQuote(account:Readonly<AccountSnapshot>|null|undefined,item:ItemId,quantity=1){
 const unitPrice=shopPrice(ITEM_PRICES[item]),stock=account?.inventory[item]??0,wallet=account?.wallet??0;
 const capacity=Number.MAX_SAFE_INTEGER-stock,maxQuantity=Math.min(capacity,unitPrice===0?capacity:Math.floor(wallet/unitPrice));
 const total=unitPrice*quantity,valid=Number.isSafeInteger(quantity)&&quantity>=1&&Number.isSafeInteger(total)&&quantity<=maxQuantity&&!account?.run;
 const reason=capacity<quantity?'库存已达上限':!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(total)?'数量无效':wallet<total?'金币不足':account?.run?'当前不能购买工具':'';
 return {unitPrice,total,maxQuantity,valid,reason};
}

/** Consumes the exact modal once, and refreshes stale storage only for a new user confirmation. */
export function confirmToolPurchase(view:ViewState,service:AccountService,request:(payload:Omit<Extract<AccountRequest,{type:'purchase'}>,'operationId'>)=>boolean,publish:(account:AccountSnapshot)=>void):void {
 const pending=view.confirmation;if(pending?.kind!=='purchase')return;
 view.confirmation=null;
 if(!pending.item)return;
 if(pending.purchaseGeneration!==undefined&&pending.purchaseGeneration!==(view.account?.generation??0)){view.message='账户已变化，请重新确认';return;}
 const quantity=pending.quantity??1,quote=toolPurchaseQuote(view.account,pending.item,quantity);
 if(!quote.valid){view.message=quote.reason;return;}
 const committed=request({type:'purchase',item:pending.item,quantity,quotedPrice:quote.total});
 if(!committed&&!view.accountBlocked&&(view.message==='账户已更新，请重新读取'||view.message==='工具报价已变化，请重新确认')){
  const fresh=service.refresh();view.accountStatus=fresh.status;
  if(fresh.status==='ready'&&fresh.account){publish(fresh.account);view.message='账户已变化，请重新确认';}
  else {view.accountBlocked=true;view.saveStatus=fresh.message;}
 }
}
