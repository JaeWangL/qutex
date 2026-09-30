import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import temml from '../../vendor/temml/dist/temml.mjs';
const cases=[['korean',String.raw`\text{한글 수식}\quad\lim_{n\to\infty}\frac{n^2+2n}{3n^2+1}=\frac13`],['boxes',String.raw`\boxed{x^2+1}\quad\overline{AB}\quad\cancel{x}`],['aligned',String.raw`\begin{aligned}(a+b)^2&=a^2+2ab+b^2\\&=(a-b)^2+4ab\end{aligned}`],['matrix',String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`]];
const font=await fs.readFile('../../fonts/QutexMath-Regular.woff2');
const css=await fs.readFile('../../vendor/temml/dist/Temml-Latin-Modern.css','utf8');
const rows=await Promise.all(cases.map(async([id,latex])=>`<tr><th>${id}</th><td>${temml.renderToString(latex,{displayMode:true})}</td><td>${await fs.readFile(`output/prod-${id}.svg`,'utf8')}</td></tr>`));
const html=`<style>${css}@font-face{font-family:Qutex;src:url(data:font/woff2;base64,${font.toString('base64')})}body{margin:20px;background:white;color:black;font-family:Arial}math{font-family:Qutex;font-size:28px}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:20px}td{min-width:390px}</style><h1>Browser Qutex Math / SVG MathJax Modern</h1><table><tr><th>Case</th><th>Browser MathML</th><th>SVG</th></tr>${rows.join('')}</table>`;
await fs.writeFile('output/compare.html',html);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:1});
try{await page.setContent(html);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'output/compare.png',fullPage:true});}finally{await browser.close();}
