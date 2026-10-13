import {STATIC_ART_RESOURCES} from './static-art-manifest.ts';
import type {StaticArtKey,StaticArtResource} from './static-art-manifest.ts';

export const STATIC_ART_PREVIEW_LIMIT=6*1024*1024;
export interface StaticArtRequirements {readonly scene:StaticArtKey;readonly shared:readonly StaticArtKey[];readonly previews:readonly StaticArtKey[]}
export interface StaticArtReadiness {readonly status:'loading'|'ready'|'error'|'superseded';readonly loaded:number;readonly total:number;readonly error?:string}
type ImageLoader=(path:string)=>Promise<CanvasImageSource>;
const normalize=(value:StaticArtRequirements):StaticArtRequirements=>({scene:value.scene,shared:[...new Set(value.shared)].sort(),previews:[...new Set(value.previews)].sort()});
const signature=(value:StaticArtRequirements):string=>JSON.stringify(normalize(value));
const keys=(value:StaticArtRequirements):string[]=>[...new Set([value.scene,...value.shared,...value.previews])];
const bytes=(resource:StaticArtResource):number=>resource.width*resource.height*4;

/** Owns decoded image references only. One sequential decode prevents overlapping obsolete scenes.
 * Dropping references permits host reclamation; it cannot guarantee immediate native/GPU release.
 */
export class StaticArtResources {
 private load:ImageLoader;
 private resources:Readonly<Record<StaticArtKey,StaticArtResource>>;
 private images=new Map<StaticArtKey,CanvasImageSource>();
 private errors=new Map<StaticArtKey,string>();
 private desired:StaticArtRequirements|null=null;
 private identity='';
 private currentScene:StaticArtKey|null=null;
 private inFlight:StaticArtKey|null=null;
 private pumping=false;
 private disposed=false;
 private warmPaused=true;
 private warmFailed=new Set<string>();
 private warmed=new Set<string>();
 private priority:string[]=[];
 private core:StaticArtRequirements|null=null;
 private requirementError:string|undefined;
 private waiters:((value:StaticArtReadiness)=>void)[]=[];
 constructor(load:ImageLoader,resources:Readonly<Record<StaticArtKey,StaticArtResource>>=STATIC_ART_RESOURCES){this.load=load;this.resources=resources;}
 getImage(key:StaticArtKey):CanvasImageSource|null{return this.images.get(key)??null;}
 readiness(needed:readonly string[]):StaticArtReadiness {
  if(this.disposed)return {status:'superseded',loaded:0,total:needed.length};
  const unique=[...new Set(needed)],loaded=unique.filter(key=>this.images.has(key)).length;
  const unknown=unique.find(key=>!this.resources[key]),error=unknown?`缺少美术资源：${unknown}`:unique.map(key=>this.errors.get(key)).find(Boolean);
  return {status:error?'error':loaded===unique.length?'ready':'loading',loaded,total:unique.length,...(error?{error}:{})};
 }
 setWarmPaused(paused:boolean):void {this.warmPaused=paused;}
 /** A frame grants at most one speculative image; no recursive warm pump. */
 warm(candidates:readonly string[]):void {
  if(this.warmPaused||this.pumping||this.disposed||this.status().status!=='ready')return;
  const key=candidates.find(key=>key.startsWith('preview.')&&this.resources[key]&&!this.images.has(key)&&!this.warmFailed.has(key)&&!this.warmed.has(key));if(!key)return;
  const resource=this.resources[key];if(bytes(resource)>STATIC_ART_PREVIEW_LIMIT)return;
  this.trim(bytes(resource));
  if(this.retention().previewBytes+bytes(resource)>STATIC_ART_PREVIEW_LIMIT)return;
  this.pumping=true;this.inFlight=key;this.warmed.add(key);
  void (async()=>{try{
   if(this.disposed||this.warmPaused)return;
   const image=await this.load(resource.src),size=image as {width?:number;height?:number};
   if(size.width!==resource.width||size.height!==resource.height)throw Error('图片尺寸不符');
   if(!this.disposed&&(!this.warmPaused||this.desired&&keys(this.desired).includes(key)))this.images.set(key,image);
  }catch{this.warmFailed.add(key);}finally{this.inFlight=null;this.pumping=false;if(!this.images.has(key)&&!this.warmFailed.has(key))this.warmed.delete(key);this.trim();if(!this.disposed)void this.pump();}})();
 }
 private trim(reservePreview=0):void {
  const pinned=new Set(this.desired?keys(this.desired):[]);
  const previewSize=()=>[...this.images.keys()].filter(key=>key.startsWith('preview.')).reduce((sum,key)=>sum+bytes(this.resources[key]),0);
  for(const key of this.images.keys())if(key.startsWith('preview.')&&!pinned.has(key)&&previewSize()+reservePreview>STATIC_ART_PREVIEW_LIMIT)this.images.delete(key);
  let optionalShared=[...this.images.keys()].filter(key=>!key.startsWith('scene.')&&!key.startsWith('preview.')&&!pinned.has(key));
  while(optionalShared.reduce((sum,key)=>sum+bytes(this.resources[key]),0)>12*1024*1024){this.images.delete(optionalShared[0]);optionalShared=optionalShared.slice(1);}
 }
 status(requirements?:StaticArtRequirements):StaticArtReadiness {
  if(this.disposed||requirements&&signature(requirements)!==this.identity)return {status:'superseded',loaded:0,total:requirements?keys(requirements).length:0};
  const needed=this.desired?keys(this.desired):[],loaded=needed.filter(key=>this.images.has(key)).length;
  const error=this.requirementError??needed.map(key=>this.errors.get(key)).find(Boolean);
  return {status:error?'error':loaded===needed.length&&this.desired?'ready':'loading',loaded,total:needed.length,...(error?{error}:{})};
 }
 prepare(requirements:StaticArtRequirements,core:StaticArtRequirements=requirements):Promise<StaticArtReadiness> {
  this.priority=keys(core);this.core=normalize(core);
  if(this.disposed)return Promise.resolve(this.status(requirements));
  const next=normalize(requirements),identity=signature(next);
  if(identity!==this.identity){
   this.resolveWaiters({status:'superseded',loaded:0,total:this.desired?keys(this.desired).length:0});
   this.desired=next;this.identity=identity;this.requirementError=undefined;
   const needed=keys(next),unknown=needed.find(key=>!this.resources[key]);
   if(unknown)this.requirementError=`缺少美术资源：${unknown}`;
   else if(!next.scene.startsWith('scene.')||next.previews.some(key=>!key.startsWith('preview.'))||next.shared.some(key=>key.startsWith('scene.')||key.startsWith('preview.')))this.requirementError='美术资源分组无效';
   else if(next.previews.reduce((sum,key)=>sum+bytes(this.resources[key]),0)>STATIC_ART_PREVIEW_LIMIT)this.requirementError='预览图片超过 6 MiB 内存限额';
   const retained=new Set(needed);for(const key of needed){const image=this.images.get(key);if(image){this.images.delete(key);this.images.set(key,image);}}this.trim();
   for(const key of this.errors.keys())if(!retained.has(key))this.errors.delete(key);
  }
  const status=this.status();if(this.requirementError||status.status==='ready'||!keys(next).some(key=>!this.images.has(key)&&!this.errors.has(key)))return Promise.resolve(status);
  const pending=new Promise<StaticArtReadiness>(resolve=>this.waiters.push(resolve));void this.pump();return pending;
 }
 retry(requirements:StaticArtRequirements):Promise<StaticArtReadiness> {
  for(const key of keys(requirements))this.errors.delete(key);
  return this.prepare(requirements,this.core??requirements);
 }
 retention():{retainedKeys:string[];sceneImages:number;inFlightScenes:number;previewImages:number;previewBytes:number;inFlightPreviewBytes:number} {
  const retainedKeys=[...this.images.keys()],previews=retainedKeys.filter(key=>key.startsWith('preview.'));
  return {retainedKeys,sceneImages:retainedKeys.filter(key=>key.startsWith('scene.')).length,inFlightScenes:this.inFlight?.startsWith('scene.')?1:0,previewImages:previews.length,previewBytes:previews.reduce((sum,key)=>sum+bytes(this.resources[key]),0),inFlightPreviewBytes:this.inFlight?.startsWith('preview.')?bytes(this.resources[this.inFlight]):0};
 }
 dispose():void {this.disposed=true;this.images.clear();this.errors.clear();this.currentScene=null;this.resolveWaiters({status:'superseded',loaded:0,total:0});}
 private resolveWaiters(value:StaticArtReadiness):void {const waiters=this.waiters;this.waiters=[];for(const resolve of waiters)resolve(value);}
 private async pump():Promise<void> {
  if(this.pumping||this.disposed)return;this.pumping=true;
  try {
   while(this.desired&&!this.disposed){
    const status=this.status();if(this.requirementError){this.resolveWaiters(status);break;}
    const key=[...new Set([...this.priority,...keys(this.desired)])].filter(key=>keys(this.desired!).includes(key)).find(key=>!this.images.has(key)&&!this.errors.has(key));if(!key){this.resolveWaiters(status);break;}
    const resource=this.resources[key];if(key.startsWith('preview.'))this.trim(bytes(resource));this.inFlight=key;
    try {
     // Ignore work no longer needed by the current page or selection.
     if(!keys(this.desired).includes(key))continue;
     const next=await this.load(resource.src),size=next as {width?:number;height?:number};
     if(size.width!==resource.width||size.height!==resource.height)throw Error(`图片尺寸不符：${key}`);
     if(this.disposed)break;
     if(keys(this.desired).includes(key)){
      if(key.startsWith('scene.')){if(this.currentScene&&this.currentScene!==key)this.images.delete(this.currentScene);this.currentScene=key;}
      this.images.set(key,next);this.trim();
     }
    }catch(error){if(!this.disposed&&keys(this.desired).includes(key))this.errors.set(key,error instanceof Error?`${key}：${error.message}`:`无法加载美术资源：${key}`);}
    finally{this.inFlight=null;}
   }
  }finally{this.pumping=false;}
 }
}
let service:StaticArtResources|undefined;
export function configureStaticArt(load:ImageLoader):void {service?.dispose();service=new StaticArtResources(load);}
export function getStaticArtImage(key:StaticArtKey):CanvasImageSource|null {return service?.getImage(key)??null;}
export function staticArtStatus(requirements:StaticArtRequirements):StaticArtReadiness {return service?.status(requirements)??{status:'error',loaded:0,total:keys(requirements).length,error:'美术资源加载器尚未就绪'};}
export function prepareStaticArt(requirements:StaticArtRequirements,core?:StaticArtRequirements):Promise<StaticArtReadiness> {return service?.prepare(requirements,core)??Promise.resolve({status:'error',loaded:0,total:keys(requirements).length,error:'美术资源加载器尚未就绪'});}
export function retryStaticArt(requirements:StaticArtRequirements):Promise<StaticArtReadiness> {return service?.retry(requirements)??prepareStaticArt(requirements);}

export function staticArtKeysStatus(keys:readonly string[]):StaticArtReadiness {return service?.readiness(keys)??{status:'error',loaded:0,total:keys.length,error:'美术资源加载器尚未就绪'};}
export function setStaticArtWarmPaused(paused:boolean):void {service?.setWarmPaused(paused);}
export function warmStaticArt(keys:readonly string[]):void {service?.warm(keys);}
