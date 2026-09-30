import { mkdir, writeFile } from 'node:fs/promises';
import { renderToString } from '../src/core.mjs';
import { renderToSVG, closeRenderer } from '../src/svg.mjs';
import { corpus } from './corpus.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await mkdir('artifacts/specimen', { recursive: true });
const rows = [];
const cases = [
  ['근호·소문자', String.raw`\sqrt{x}+\sqrt{y}+\sqrt{\pi}`],
  ['근호·첨자', String.raw`\sqrt{b^2}+\sqrt{x_i}`],
  ['근호·분수', String.raw`\sqrt{\frac{1}{x}}+\sqrt{1+\sqrt{x}}`],
  ...corpus,
];
for (const [index, [label, latex]] of cases.entries()) {
  let mathml = ''; let vector = ''; let detail = '';
  try { mathml = renderToString(latex, { displayMode: true }); } catch (error) { mathml = escape(error.message); }
  try {
    const result = await renderToSVG(latex, { displayMode: true, fontSize: 11 * 96 / 72 });
    await writeFile(`artifacts/specimen/${index + 1}.svg`, result.svg);
    vector = `<img src="${index + 1}.svg" width="${result.width}" height="${result.height}" alt="${escape(latex)}">`;
    detail = `${result.width.toFixed(2)} × ${result.height.toFixed(2)} px · baseline ${result.baseline.toFixed(2)} px`;
  } catch (error) { vector = `<span class="error">${escape(error.message)}</span>`; }
  rows.push(`<section><div class="label">${escape(label)}</div><div class="formula">${mathml}</div><div class="formula">${vector}</div><pre>${escape(latex)}</pre><small>${detail}</small></section>`);
}
await closeRenderer();
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Qutex 수식 비교</title><link rel="stylesheet" href="../../dist/v0.2.0/qutex.css"><style>
*{box-sizing:border-box}body{margin:0;background:#f3f5fa;color:#152238;font-family:system-ui,sans-serif}main{max-width:1160px;margin:44px auto;padding:24px}h1{font-size:34px}p{line-height:1.7}a{color:#087b52}.note{padding:18px;border-left:4px solid #13ae71;background:#e4f6ed;margin:24px 0}.headers,section{display:grid;grid-template-columns:170px 1fr 1fr;gap:20px;padding:20px;background:white;border-bottom:1px solid #e1e6ed}.headers{font-weight:700;background:#dae9e2}.label{font-weight:650}.formula{font-size:11pt;min-height:50px;display:flex;align-items:center;justify-content:center;overflow:auto}math.tml-display{width:auto;margin:0}.error{font:12px system-ui;color:#a23b18}pre{grid-column:2 / 4;white-space:pre-wrap;font-size:12px;color:#57677d;margin:0}small{grid-column:2 / 4;color:#63718b}.preview{max-width:360px;width:100%;border:1px solid #ddd}@media(max-width:700px){.headers,section{grid-template-columns:1fr}.label,pre,small{grid-column:1}.headers{display:none}}
</style></head><body><main><h1>Qutex 0.2 수식 비교</h1><p>Temml 기반 MathML · 독립 벡터 SVG · 동일 11pt</p><div class="note">근호 여백을 보정하고 브라우저와 서버가 실제로 같은 Qutex Math 글꼴을 사용하도록 연결했습니다. SVG는 정밀 벡터 배치로 작은 선의 굵기 반올림도 줄였습니다. Latin Modern의 자형은 유지했으므로 한컴 HYhwpEQ와 모든 글자 모양이 같지는 않습니다. <a href="../radicals/index.html">실제 한컴 출력 · 이전 · 수정 결과 비교 →</a></div><div class="headers"><span>항목</span><span>브라우저 MathML / Qutex Math 0.2</span><span>서버 SVG / 같은 Qutex Math 0.2</span></div>${rows.join('')}<h2>제공된 HWP 기준 자료</h2><p>5,413개 수식 모두 HYhwpEQ · 11pt. 아래는 원본에 저장된 첫 페이지 미리보기(723×1024)입니다. 고해상도 비교에는 별도 원본 한컴 PDF의 동일 수식을 사용했습니다. 이 미리보기와 그 PDF는 서로 다른 문서이며, 사용자 자료는 로컬에만 보관합니다.</p><img class="preview" src="../local-reference/embedded-preview.png" alt="참조 HWP의 저장 미리보기"></main></body></html>`;
await writeFile('artifacts/specimen/index.html', html);
console.log('artifacts/specimen/index.html');
