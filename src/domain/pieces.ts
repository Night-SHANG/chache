import type {CargoId,Piece} from './types.ts';
import {SHAPES} from './rulesets/v1/content.ts';
import {COLOR_EXIT_CARGO} from './v4/content.ts';
import {MIXED_COLOR_PATTERNS,MIXED_COLOR_SHAPE_ID} from './v5/content.ts';
/** Cell index is always the corresponding index in SHAPES.cells, including legacy solid pieces. */
export function pieceCellCargo(piece:Piece,index:number):CargoId {return piece.cellCargos?.[index]??piece.cargo;}
export function isMixedColorPiece(piece:Piece):boolean {return piece.cellCargos!==undefined;}
/** Shared by untrusted save validation and the v5 domain entry points. */
export function isValidColorExitPiece(value:unknown):value is Piece {
 if(value===null||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as Partial<Piece>;
 if(typeof p.id!=='string'||!p.id||!SHAPES.some(shape=>shape.id===p.shapeId)||!COLOR_EXIT_CARGO.some(cargo=>cargo===p.cargo)||p.trait!==undefined||p.rushTurns!==undefined)return false;
 if(p.cellCargos===undefined)return true;
 return p.shapeId===MIXED_COLOR_SHAPE_ID&&Array.isArray(p.cellCargos)&&p.cellCargos.length===4&&p.cellCargos[0]===p.cargo&&MIXED_COLOR_PATTERNS.some(pattern=>pattern.every((cargo,index)=>cargo===p.cellCargos![index]));
}
