import {L,type Rect} from './layout.ts';

/** Keep the original artwork and controls at their authored sizes. Android's
 * extra safe height becomes seven gaps between the eight homepage groups.
 * The title stays together; the footer and warnings retain their bottom margin.
 * With no Android bounds, every coordinate is exactly the legacy composition. */
export function homeLayout(androidContentBounds?:Rect) {
 const valid=androidContentBounds&&Number.isFinite(androidContentBounds.y)&&Number.isFinite(androidContentBounds.h)&&androidContentBounds.h>0;
 const top=valid?androidContentBounds.y:0,extra=valid?Math.max(0,androidContentBounds.h-L.height):0;
 const y=(base:number,gap:number)=>base+top+extra*gap/7;
 return {
  eyebrowY:y(120,0),titleY:y(267,0),subtitleY:y(387,0),stripe:{x:314,y:y(448,0),w:452,h:14},
  forkliftY:y(565,1),shadowY:y(601,1),walletY:y(670,2),
  inbound:{x:210,y:y(752,3),w:660,h:176},
  outbound:{x:210,y:y(990,4),w:660,h:176},
  help:{x:210,y:y(1220,5),w:660,h:144},
  shop:{x:210,y:y(1420,6),w:318,h:132},
  settings:{x:552,y:y(1420,6),w:318,h:132},
  footerY:y(1650,7),warningsY:y(1760,7),
 };
}
