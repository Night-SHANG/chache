import ts from 'typescript';
import {unsupportedWechatCompositingModes} from './wechat-canvas-guard.mjs';

/** Inspect executable property access, not comments or quoted documentation. */
export function unsupportedDouyinCanvasAPIs(source){
 const file=ts.createSourceFile('game.js',source,ts.ScriptTarget.Latest,true),unsupported=new Set();
 const banned=new Set(['clip','lineDashOffset','isPointInPath','isPointInStroke']);
 function visit(node){
  const name=ts.isPropertyAccessExpression(node)?node.name.text:ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression)?node.argumentExpression.text:undefined;
  if(name&&banned.has(name))unsupported.add(name);
  ts.forEachChild(node,visit);
 }
 visit(file);return [...unsupported,...unsupportedWechatCompositingModes(source).map(mode=>`globalCompositeOperation:${mode}`)].sort();
}
