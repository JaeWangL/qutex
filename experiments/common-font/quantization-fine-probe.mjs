import{renderToSVGNative,closeNativeRenderer}from '../../src/svg-browser.mjs';import{withNativePage}from '../../src/browser-runtime.mjs';
try{for(const [dpr,scale] of [[1,16],[1,32]]){
 await withNativePage(async page=>{const session=await page.context().newCDPSession(page);await session.send('Emulation.setDeviceMetricsOverride',{width:4096,height:4096,deviceScaleFactor:dpr,mobile:false});await session.detach()});
 const r=await renderToSVGNative(String.raw`2\sqrt{3}`,{fontSize:11.031904*96/72*scale});
 const boxes=await withNativePage(page=>page.evaluate(svg=>{const d=document.createElement('div');d.innerHTML=svg;document.body.append(d);const s=d.firstElementChild,root=s.getScreenCTM().inverse();try{return[...s.querySelectorAll('path')].filter(n=>!n.closest('defs')).map(n=>{const b=n.getBBox(),m=root.multiply(n.getScreenCTM()),p1=new DOMPoint(b.x,b.y).matrixTransform(m),p2=new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m);return{x:p1.x,y:p1.y,width:p2.x-p1.x,height:p2.y-p1.y}})}finally{d.remove()}},r.svg));
 console.log(JSON.stringify({dpr,scale,font:r.fontSha256,width:r.contentBounds.width/scale,height:r.contentBounds.height/scale,gapPt:(boxes[3].y-boxes[2].y-boxes[2].height)/scale*.75,barPt:boxes[2].height/scale*.75,boxes}));
}}finally{await closeNativeRenderer()}
