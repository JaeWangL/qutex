import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright-core';
import {createCanvas,DOMMatrix,Path2D,ImageData} from '@napi-rs/canvas';
import {JSDOM} from 'jsdom';
import SvgCanvas from 'svgcanvas';
import temml from '../../vendor/temml/dist/temml.mjs';
const dom = new JSDOM();
Object.assign(globalThis,{DOMMatrix,Path2D,ImageData,document:dom.window.document,XMLSerializer:dom.window.XMLSerializer});
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const ns='http://www.w3.org/2000/svg';
const start=performance.now();
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage();
const font=await fs.readFile('../../vendor/temml/site/assets/latinmodernmath.woff2');
const css=await fs.readFile('../../vendor/temml/dist/Temml-Latin-Modern.css','utf8');
const latex=String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a} \quad \text{한글 수식}`;
await page.setContent(`<style>${css}@font-face{font-family:'Latin Modern Math';src:url(data:font/woff2;base64,${font.toString('base64')})}html,body{margin:0;background:transparent}#eq{display:inline-block;padding:4px;font-size:24px;}@page{margin:0}</style><div id="eq">${temml.renderToString(latex,{displayMode:true})}</div>`);
await page.evaluate(()=>document.fonts.ready);
const box=await page.locator('#eq').boundingBox();
const pdf=await page.pdf({width:`${Math.ceil(box.width)}px`,height:`${Math.ceil(box.height)}px`,printBackground:true});
await fs.writeFile('output/chromium.pdf',pdf);
await page.screenshot({path:'output/chromium.png',clip:{x:0,y:0,width:Math.ceil(box.width),height:Math.ceil(box.height)}});
const pdfTime=performance.now();
const pdfDoc=await getDocument({data:new Uint8Array(pdf),disableFontFace:true,isEvalSupported:false,useSystemFonts:false}).promise;
const pdfPage=await pdfDoc.getPage(1),view=pdfPage.getViewport({scale:4/3});
const ctx=new SvgCanvas({width:view.width,height:view.height,document:dom.window.document,ctx:createCanvas(1,1).getContext('2d')});
function emitPath(path,mode,rule){
 const node=dom.window.document.createElementNS(ns,'path');
 node.setAttribute('d',path.toSVGString());
 const {a,b,c,d,e,f}=this.getTransform();
 node.setAttribute('transform',`matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
 node.setAttribute('fill',mode==='fill'?this.fillStyle:'none');
 if(mode==='stroke'){node.setAttribute('stroke',this.strokeStyle);node.setAttribute('stroke-width',this.lineWidth);}
 if(rule==='evenodd')node.setAttribute('fill-rule','evenodd');
 this.__closestGroupOrSvg().appendChild(node);
}
for(const mode of ['fill','stroke']){
 const original=ctx[mode];
 ctx[mode]=function(path,rule){if(path instanceof Path2D)return emitPath.call(this,path,mode,rule);return original.call(this,path);};
}
const originalClip=ctx.clip;
ctx.clip=function(path,rule){
 if(!(path instanceof Path2D))return originalClip.call(this);
 // PDF glyphs/math are within the page crop; verify any clipping operators before production.
};
try {
 await pdfPage.render({canvasContext:ctx,viewport:view,background:'rgba(0,0,0,0)'}).promise;
 await fs.writeFile('output/chromium.svg',ctx.getSerializedSvg());
 console.log(JSON.stringify({box,pdfMs:pdfTime-start,svgMs:performance.now()-pdfTime,totalMs:performance.now()-start,bytes:ctx.getSerializedSvg().length,paths:(ctx.getSerializedSvg().match(/<path/g)||[]).length}));
}finally{await browser.close();}
