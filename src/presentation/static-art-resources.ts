import {STATIC_ART_RESOURCES} from './static-art-manifest.ts';
import type {StaticArtKey,StaticArtResource} from './static-art-manifest.ts';

export const STATIC_ART_PREVIEW_LIMIT=6*1024*1024;
export interface StaticArtRequirements {readonly scene:StaticArtKey;readonly shared:readonly StaticArtKey[];readonly previews:readonly StaticArtKey[]}
export interface StaticArtReadiness {readonly status:'loading'|'ready'|'error'|'superseded';readonly loaded:number;readonly total:number;readonly error?:string}
type ImageLoader=(path:string)=>Promise<CanvasImageSource>;
type PackageLoader=(name:string)=>Promise<void>;
const normalize=(value:StaticArtRequirements):StaticArtRequirements=>({scene:value.scene,shared:[...new Set(value.shared)].sort(),previews:[...new Set(value.previews)].sort()});
const signature=(value:StaticArtRequirements):string=>JSON.stringify(normalize(value));
const keys=(value:StaticArtRequirements):string[]=>[...new Set([value.scene,...value.shared,...value.previews])];
const bytes=(resource:StaticArtResource):number=>resource.width*resource.height*4;

/** Owns decoded image references only. One sequential decode prevents overlapping obsolete scenes.
 * Dropping references permits host reclamation; it cannot guarantee immediate native/GPU release.
 */
export class StaticArtResources {
 private load:ImageLoader;
 private ensurePackage?:PackageLoader;
 private resources:Readonly<Record<StaticArtKey,StaticArtResource>>;
 private images=new Map<StaticArtKey,CanvasImageSource>();
 private errors=new Map<StaticArtKey,string>();
 private packages=new Set<string>();
 private desired:StaticArtRequirements|null=null;
 private identity='';
 private currentScene:StaticArtKey|null=null;
 private inFlight:StaticArtKey|null=null;
 private pumping=false;
 private disposed=false;
 private requirementError:string|undefined;
 private waiters:((value:StaticArtReadiness)=>void)[]=[];
 constructor(load:ImageLoader,ensurePackage?:PackageLoader,resources:Readonly<Record<StaticArtKey,StaticArtResource>>=STATIC_ART_RESOURCES){this.load=load;this.ensurePackage=ensurePackage;this.resources=resources;}
 getImage(key:StaticArtKey):CanvasImageSource|null{return this.images.get(key)??null;}
 status(requirements?:StaticArtRequirements):StaticArtReadiness {
  if(this.disposed||requirements&&signature(requirements)!==this.identity)return {status:'superseded',loaded:0,total:requirements?keys(requirements).length:0};
  const needed=this.desired?keys(this.desired):[],loaded=needed.filter(key=>this.images.has(key)).length;
  const error=this.requirementError??needed.map(key=>this.errors.get(key)).find(Boolean);
  return {status:error?'error':loaded===needed.length&&this.desired?'ready':'loading',loaded,total:needed.length,...(error?{error}:{})};
 }
 prepare(requirements:StaticArtRequirements):Promise<StaticArtReadiness> {
  if(this.disposed)return Promise.resolve(this.status(requirements));
  const next=normalize(requirements),identity=signature(next);
  if(identity!==this.identity){
   this.resolveWaiters({status:'superseded',loaded:0,total:this.desired?keys(this.desired).length:0});
   this.desired=next;this.identity=identity;this.requirementError=undefined;
   const needed=keys(next),unknown=needed.find(key=>!this.resources[key]);
   if(unknown)this.requirementError=`缺少美术资源：${unknown}`;
   else if(!next.scene.startsWith('scene.')||next.previews.some(key=>!key.startsWith('preview.'))||next.shared.some(key=>key.startsWith('scene.')||key.startsWith('preview.')))this.requirementError='美术资源分组无效';
   else if(next.previews.reduce((sum,key)=>sum+bytes(this.resources[key]),0)>STATIC_ART_PREVIEW_LIMIT)this.requirementError='预览图片超过 6 MiB 内存限额';
   const retained=new Set(needed);for(const key of this.images.keys())if(!retained.has(key)&&key!==this.currentScene)this.images.delete(key);
   for(const key of this.errors.keys())if(!retained.has(key))this.errors.delete(key);
  }
  const status=this.status();if(status.status!=='loading')return Promise.resolve(status);
  const pending=new Promise<StaticArtReadiness>(resolve=>this.waiters.push(resolve));void this.pump();return pending;
 }
 retry(requirements:StaticArtRequirements):Promise<StaticArtReadiness> {
  for(const key of keys(requirements))this.errors.delete(key);
  return this.prepare(requirements);
 }
 retention():{retainedKeys:string[];sceneImages:number;inFlightScenes:number;previewImages:number;previewBytes:number;inFlightPreviewBytes:number} {
  const retainedKeys=[...this.images.keys()],previews=retainedKeys.filter(key=>key.startsWith('preview.'));
  return {retainedKeys,sceneImages:retainedKeys.filter(key=>key.startsWith('scene.')).length,inFlightScenes:this.inFlight?.startsWith('scene.')?1:0,previewImages:previews.length,previewBytes:previews.reduce((sum,key)=>sum+bytes(this.resources[key]),0),inFlightPreviewBytes:this.inFlight?.startsWith('preview.')?bytes(this.resources[this.inFlight]):0};
 }
 dispose():void {this.disposed=true;this.images.clear();this.errors.clear();this.packages.clear();this.currentScene=null;this.resolveWaiters({status:'superseded',loaded:0,total:0});}
 private resolveWaiters(value:StaticArtReadiness):void {const waiters=this.waiters;this.waiters=[];for(const resolve of waiters)resolve(value);}
 private async pump():Promise<void> {
  if(this.pumping||this.disposed)return;this.pumping=true;
  try {
   while(this.desired&&!this.disposed){
    const status=this.status();if(status.status!=='loading'){this.resolveWaiters(status);break;}
    const key=keys(this.desired).find(key=>!this.images.has(key));if(!key)break;
    const resource=this.resources[key];this.inFlight=key;
    try {
     if(resource.package!=='main'&&!this.packages.has(resource.package)){await this.ensurePackage?.(resource.package);if(this.disposed)break;this.packages.add(resource.package);}
     // A page/selection can change while its package is loading. Do not decode obsolete work.
     if(!keys(this.desired).includes(key))continue;
     const next=await this.load(resource.src),size=next as {width?:number;height?:number};
     if(size.width!==resource.width||size.height!==resource.height)throw Error(`图片尺寸不符：${key}`);
     if(this.disposed)break;
     if(keys(this.desired).includes(key)){
      if(key.startsWith('scene.')){if(this.currentScene&&this.currentScene!==key)this.images.delete(this.currentScene);this.currentScene=key;}
      this.images.set(key,next);
     }
    }catch(error){if(!this.disposed&&keys(this.desired).includes(key))this.errors.set(key,error instanceof Error?`${key}：${error.message}`:`无法加载美术资源：${key}`);}
    finally{this.inFlight=null;}
   }
  }finally{this.pumping=false;}
 }
}
let service:StaticArtResources|undefined;
export function configureStaticArt(load:ImageLoader,ensurePackage?:PackageLoader):void {service?.dispose();service=new StaticArtResources(load,ensurePackage);}
export function getStaticArtImage(key:StaticArtKey):CanvasImageSource|null {return service?.getImage(key)??null;}
export function staticArtStatus(requirements:StaticArtRequirements):StaticArtReadiness {return service?.status(requirements)??{status:'error',loaded:0,total:keys(requirements).length,error:'美术资源加载器尚未就绪'};}
export function prepareStaticArt(requirements:StaticArtRequirements):Promise<StaticArtReadiness> {return service?.prepare(requirements)??Promise.resolve({status:'error',loaded:0,total:keys(requirements).length,error:'美术资源加载器尚未就绪'});}
export function retryStaticArt(requirements:StaticArtRequirements):Promise<StaticArtReadiness> {return service?.retry(requirements)??prepareStaticArt(requirements);}
