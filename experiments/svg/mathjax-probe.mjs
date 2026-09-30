import { performance } from 'node:perf_hooks';
import fs from 'node:fs/promises';
import temml from '../../vendor/temml/dist/temml.mjs';
import {mathjax} from '@mathjax/src/js/mathjax.js';
import {MathML} from '@mathjax/src/js/input/mathml.js';
import {SVG} from '@mathjax/src/js/output/svg.js';
import {liteAdaptor} from '@mathjax/src/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from '@mathjax/src/js/handlers/html.js';
import {MathJaxModernFont} from '@mathjax/mathjax-modern-font/js/svg.js';
import '@mathjax/src/js/util/asyncLoad/esm.js';
const t = performance.now();
const adaptor=liteAdaptor();
RegisterHTMLHandler(adaptor);
const svg = new SVG({fontCache:'none',fontData: MathJaxModernFont});
const doc=mathjax.document('', {InputJax:new MathML(), OutputJax:svg});
const rows = [
 ['fraction',String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`],
 ['limit',String.raw`\lim_{n\to\infty}\frac{n^2+2n}{3n^2+1}=\frac13`],
 ['matrix',String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`],
 ['cases',String.raw`f(x)=\begin{cases}x^2&x<0\\\sqrt{x}&x\ge0\end{cases}`],
 ['integral',String.raw`\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}`],
 ['aligned',String.raw`\begin{aligned}(a+b)^2&=a^2+2ab+b^2\\&=(a-b)^2+4ab\end{aligned}`],
 ['accents',String.raw`\overrightarrow{AB}+\widehat{ABC}+\underbrace{x+\cdots+x}_{n}`],
 ['korean',String.raw`\text{단, }x\ne0`],
 ['color',String.raw`\color{blue}{\frac{x}{y}}+\boxed{z^2}`],
];
await fs.mkdir('output',{recursive:true});
const result=[];
for(const [id,latex] of rows){
  const start=performance.now();
  try{
    const mathml=temml.renderToString(latex,{displayMode:true,throwOnError:true});
    const node=await doc.convertPromise(mathml,{em:16,ex:8,containerWidth:1280});
    let output=adaptor.outerHTML(node);output=output.slice(output.indexOf('<svg'),output.lastIndexOf('</svg>')+6);
    await fs.writeFile(`output/${id}.svg`,output);
    result.push({id,ok:true,ms:performance.now()-start,bytes:output.length,textNodes:(output.match(/<text/g)||[]).length,pathCount:(output.match(/<path/g)||[]).length});
  }catch(e){ result.push({id,ok:false,error:String(e)}); }
}
console.log(JSON.stringify({totalMs:performance.now()-t,result},null,2));
await fs.writeFile('output/metrics.json',JSON.stringify({totalMs:performance.now()-t,result},null,2));
