import {writeFile} from 'node:fs/promises';
import temml from '../../vendor/temml/dist/temml.mjs';
const formulas=[['x',String.raw`\sqrt{x}`],['y',String.raw`\sqrt{y}`],['pi',String.raw`\sqrt{\pi}`],['power',String.raw`\sqrt{b^2}`],['fraction',String.raw`\sqrt{\frac{1+x}{1-x}}`],['integral',String.raw`\sqrt{\int_0^1 t^2\,dt}`],['cube',String.raw`\sqrt[3]{x+1}`],['nested',String.raw`\sqrt{\sqrt{x^2+1}+1}`]];
const fonts=[['lm','LM / Qutex baseline','../../fonts/QutexMath-Regular.otf'],['gap100','LM gap .100em','fonts/gap-100.otf'],['gap125','LM gap .125em','fonts/gap-125.otf'],['stix','STIX Two Math','fonts/STIXTwoMath-Regular.ttf'],['xits','XITS Math','fonts/XITSMath-Regular.otf']];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let body='';
for(const display of [false,true]) {
 body+=`<h2>${display?'Display / normal math-style':'Inline / compact math-style'} · 11 pt</h2><div class="grid"><div>LaTeX</div>${fonts.map(f=>`<b>${f[1]}</b>`).join('')}`;
 for (const [id,latex]of formulas) {
  body+=`<code>${esc(latex)}</code>`;
  for(const [key]of fonts) {
   let mml=temml.renderToString(latex,{displayMode:display});
   body+=`<div class="sample ${key}" data-id="${key}-${display?'display':'inline'}-${id}">${mml}</div>`;
  }
 }
 body+='</div>';
}
const style=fonts.map(([key,label,url])=>`@font-face{font-family:${key};src:url('${url}')} .${key} math{font-family:${key}}`).join('\n');
await writeFile(new URL('index.html',import.meta.url),`<!doctype html><meta charset=utf-8><title>Radical font experiment</title><style>${style}
body{margin:24px;color:#111;background:white;font:12px system-ui}h1{font-size:22px}h2{font-size:16px;margin-top:24px}.grid{display:grid;grid-template-columns:180px repeat(5,1fr);align-items:center}.grid>*{min-height:65px;border-bottom:1px solid #eee;padding:12px 4px;box-sizing:border-box}.sample{font-size:11pt;display:flex;align-items:center;justify-content:center}math{font-style:normal;font-weight:normal;line-height:normal;letter-spacing:normal}math.tml-display{display:block;width:auto;margin:0}code{font-size:9px}.notes{font-size:12px;color:#444}.sample.debug{color:#111}.sample.debug msqrt>*,.sample.debug mroot>:first-child{color:#0044ff}
</style><h1>Same 11pt · native Chromium MathML · no CSS spacing correction</h1><p class=notes>Experimental gap fonts change only RadicalVerticalGap (50 → 100 / 125). Display gap148, rule40 unchanged. STIX and XITS unchanged official fonts. No claim of Hancom likeness.</p>${body}`);
