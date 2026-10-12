/** Android's HTML cover stays unchanged until a complete game or failure frame exists. */
export class AndroidLaunchSurface {
 private status:Pick<HTMLElement,'hidden'|'textContent'>;
 constructor(status:Pick<HTMLElement,'hidden'|'textContent'>){this.status=status;}
 get isCovering():boolean {return !this.status.hidden;}
 paint(readiness:'loading'|'error'|'ready'|'superseded',draw:()=>void):void {
  if(this.isCovering&&readiness!=='ready'&&readiness!=='error')return;
  // Draw first: a render exception must never expose an incomplete canvas.
  draw();if(this.isCovering)this.status.hidden=true;
 }
 fail(error:unknown):void {
  this.status.hidden=false;
  this.status.textContent=`无法开始游戏\n${error instanceof Error?error.message:'Android 启动检查失败'}\n已有存档未被清空。`;
 }
}
