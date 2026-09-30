import {spawn}from'node:child_process';import{mkdir,writeFile}from'node:fs/promises';import{fileURLToPath}from'node:url';
const dir=new URL('./',import.meta.url);const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=9456','--user-data-dir=/tmp/qutex-radical-font-chrome','--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore'});
let ws;
try{
 for(let t=0;t<100;t++){try{await fetch('http://127.0.0.1:9456/json/version');break}catch{await new Promise(r=>setTimeout(r,100))}}
 const tab=await(await fetch('http://127.0.0.1:9456/json/new?'+encodeURIComponent(new URL('index.html',dir).href),{method:'PUT'})).json();
 ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let next=0;const waiting=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){const{resolve,reject}=waiting.get(m.id);waiting.delete(m.id);m.error?reject(m.error):resolve(m.result)}});const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1300,height:1900,deviceScaleFactor:4,mobile:false});
 await send('Runtime.evaluate',{expression:'document.fonts.ready.then(()=>true)',awaitPromise:true});
 await send('Runtime.evaluate',{expression:'Promise.all(["lm","gap100","gap125","stix","xits"].map(f=>document.fonts.load("14.667px "+f))).then(()=>true)',awaitPromise:true});
 await send('Runtime.evaluate',{expression:'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))',awaitPromise:true});
 const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(new URL('comparison-11pt.png',dir),Buffer.from(data,'base64'));
 await send('Runtime.evaluate',{expression:'document.querySelectorAll(".sample").forEach(e=>e.classList.add("debug"))'});
 const value=await send('Runtime.evaluate',{expression:`JSON.stringify([...document.querySelectorAll('.sample')].map(e=>{const m=e.querySelector('math'),r=e.querySelector('msqrt,mroot'),c=r.firstElementChild;const rect=x=>{const b=x.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};return{id:e.dataset.id,font:getComputedStyle(m).fontFamily,fontSize:getComputedStyle(m).fontSize,mathStyle:getComputedStyle(r).mathStyle,math:rect(m),root:rect(r),content:rect(c)}}))`,returnByValue:true});
 const metrics=JSON.parse(value.result.value);await mkdir(new URL('crops/',dir),{recursive:true});
 for(const m of metrics){const b=m.math;const clip={x:Math.max(0,b.x-3),y:Math.max(0,b.y-3),width:b.width+6,height:b.height+6,scale:1};const s=await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});await writeFile(new URL('crops/'+m.id+'.png',dir),Buffer.from(s.data,'base64'));m.clip=clip;m.deviceScaleFactor=4}
 const info=await send('Browser.getVersion');await writeFile(new URL('browser-metrics.json',dir),JSON.stringify({browser:info,metrics},null,2)+'\n');
 console.log(JSON.stringify({browser:info.product,cases:metrics.length,fonts:metrics.filter(m=>m.id.endsWith('inline-x')).map(m=>[m.font,m.math.width,m.math.height,m.mathStyle])}));
}finally{ws?.close();browser.kill()}
