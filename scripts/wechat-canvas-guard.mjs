import ts from 'typescript';

// Narrow static gate for literal assignments, not an evaluator of dynamic JavaScript.
// Parsing avoids treating documentation strings/comments as executable Canvas calls.
export function unsupportedWechatCompositingModes(source,fileName='wechat.js') {
 const file=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true),modes=new Set();
 const literal=node=>ts.isStringLiteralLike(node)?node.text:undefined;
 const unwrap=node=>ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isNonNullExpression(node)||ts.isSatisfiesExpression(node)?unwrap(node.expression):node;
 const assignments=new Set([ts.SyntaxKind.EqualsToken,ts.SyntaxKind.BarBarEqualsToken,ts.SyntaxKind.AmpersandAmpersandEqualsToken,ts.SyntaxKind.QuestionQuestionEqualsToken]);
 const visit=node=>{
  if(ts.isBinaryExpression(node)&&assignments.has(node.operatorToken.kind)){
   const target=unwrap(node.left),mode=literal(unwrap(node.right));
   const property=ts.isPropertyAccessExpression(target)?target.name.text:ts.isElementAccessExpression(target)?literal(target.argumentExpression):undefined;
   if(property==='globalCompositeOperation'&&(mode==='copy'||mode==='lighter'))modes.add(mode);
  }
  ts.forEachChild(node,visit);
 };
 visit(file);return [...modes];
}
