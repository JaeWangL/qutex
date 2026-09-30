import{renderToSVGNative,closeNativeRenderer}from '../../src/svg-browser.mjs';
import{withNativePage}from '../../src/browser-runtime.mjs';
try{
for(const size of [128,512])for(const latex of [String.raw`\mathscr{A}`,String.raw`\widehat{ABC}`,String.raw`x^{x^x}`]){
 const r=await renderToSVGNative(latex,{fontSize:size});
 const bbox=await withNativePage(async page=>page.evaluate(svg=>{const holder=document.createElement('div');holder.innerHTML=svg;document.body.append(holder);for(const n of holder.querySelectorAll('[fill-opacity="0"],[opacity="0"]'))n.remove();const g=holder.querySelector('svg > g');const b=g.getBBox();const out={x:b.x,y:b.y,width:b.width,height:b.height};holder.remove();return out},r.svg));
 console.log(JSON.stringify({latex,size,width:r.width,height:r.height,bbox,clipped:bbox.x<0||bbox.y<0||bbox.x+bbox.width>r.width||bbox.y+bbox.height>r.height}));
}
}finally{await closeNativeRenderer()}
