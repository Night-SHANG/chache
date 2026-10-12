declare const __PLAYTEST_FREE_SHOP__: boolean;

/** Only the build may enable free claims. Unbundled source and regular builds stay paid. */
export const PLAYTEST_FREE_SHOP = typeof __PLAYTEST_FREE_SHOP__ !== 'undefined' && __PLAYTEST_FREE_SHOP__ === true;
export const shopPrice = (regularPrice:number):number => PLAYTEST_FREE_SHOP ? 0 : regularPrice;
