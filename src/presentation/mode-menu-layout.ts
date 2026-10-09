import type {Rect} from './layout.ts';
/** Both mode selectors share card edges and a visible right inset. */
export const MODE_MENU_CARD={x:132,w:816,rightInset:38} as const;
export const modeMenuStartRect=(y:number,w=230,h=144):Rect=>({x:MODE_MENU_CARD.x+MODE_MENU_CARD.w-MODE_MENU_CARD.rightInset-w,y,w,h});
