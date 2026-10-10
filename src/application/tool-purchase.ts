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
