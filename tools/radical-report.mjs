// Local-only comparison. Reference images and measurements are never published.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { renderToSVG, closeRenderer } from '../src/svg.mjs';
import { renderToString } from '../src/core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'artifacts/radicals');
const reference = JSON.parse(await readFile(resolve(root, 'artifacts/hwp-math-reference/pdf-reference/metrics.json')));
const generic = [
  ['x', String.raw`\sqrt{x}`], ['y', String.raw`\sqrt{y}`],
  ['pi', String.raw`\sqrt{\pi}`], ['power', String.raw`\sqrt{b^2-4ac}`],
  ['fraction', String.raw`\sqrt{\frac{1}{x}}`], ['nested', String.raw`\sqrt{1+\sqrt{x}}`],
  ['cube', String.raw`\sqrt[3]{x^2+1}`], ['integral', String.raw`\sqrt{\int_0^1 x^2\,dx}`],
];
const cases = reference.cases.map(item => ({ id: item.caseId, latex: item.formulaLatex, pt: item.fontVerticalPt, reference: item }));
cases.push(...generic.map(([id, latex]) => ({ id, latex, pt: 11 })));
await mkdir(out, { recursive: true });

if (process.argv.includes('--baseline')) {
  for (const item of cases) {
    const result = await renderToSVG(item.latex, { fontSize: item.pt * 96 / 72 });
    await writeFile(resolve(out, `${item.id}-before.svg`), result.svg);
    await writeFile(resolve(out, `${item.id}-before.json`), JSON.stringify(result));
  }
  await closeRenderer();
  process.exit(0);
}

execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--baseline'], {
  cwd: root,
  env: { ...process.env, QUTEX_MATH_FONT_PATH: resolve(root, 'fonts/upstream/latin-modern-math/latinmodern-math.otf') },
  timeout: 90000,
});
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const zoom = 4;
const rows = [];
const results = [];
for (const item of cases) {
  const result = await renderToSVG(item.latex, { fontSize: item.pt * 96 / 72 });
  await writeFile(resolve(out, `${item.id}-after.svg`), result.svg);
  const before = JSON.parse(await readFile(resolve(out, `${item.id}-before.json`)));
  const svg = (name, data) => `<img src="${name}" style="width:${data.width * zoom}px;height:${data.height * zoom}px" alt="${esc(item.latex)}">`;
  let original = '<small>같은 수식의 한컴 기준 출력 없음</small>';
  if (item.reference) {
    const r = item.reference;
    const physicalWidth = (r.cropRectPt[2] - r.cropRectPt[0]) * 96 / 72;
    original = `<img src="${relative(out, r.cropPath)}" style="width:${physicalWidth * zoom}px" alt="한컴 ${esc(item.latex)}"><small>실제 잉크 간격 ${r.barToRadicandInkGapPt.toFixed(3)}pt</small>`;
  }
  rows.push(`<section id="${item.id}"><header><code>${esc(item.latex)}</code><small>${item.pt.toFixed(3)}pt · ${item.reference ? (['pdf-sqrt-3', 'pdf-sqrt-7'].includes(item.id) ? '조정 기준' : '별도 검증') : '일반 입력 확인'}</small></header><div class="cell">${original}</div><div class="cell">${svg(`${item.id}-before.svg`, before)}</div><div class="cell">${svg(`${item.id}-after.svg`, result)}</div></section>`);
  results.push({ id: item.id, latex: item.latex, pt: item.pt, width: result.width, height: result.height, baseline: result.baseline, fontSha256: result.fontSha256, backend: result.backend, layoutScale: result.layoutScale });
}
await closeRenderer();
const browserRows = generic.map(([id, latex]) => `<article><code>${esc(latex)}</code><div class="live">${renderToString(latex)}</div></article>`).join('');
await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
await writeFile(resolve(out, 'index.html'), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Qutex 근호 보정 비교</title><link rel="stylesheet" href="../../dist/v0.2.0/qutex.css"><style>
*{box-sizing:border-box}body{margin:0;color:#172b25;background:#f2f5f3;font-family:system-ui,sans-serif}main{max-width:1260px;margin:36px auto;padding:24px}h1{font-size:32px;margin-bottom:12px}p{line-height:1.75;max-width:1000px}.note{background:#e1efe7;border-left:4px solid #188654;padding:18px;margin:24px 0}a{color:#087944}.heading,section{display:grid;grid-template-columns:190px 1fr 1fr 1fr;gap:12px;background:white;border-bottom:1px solid #dbe4df;padding:22px}.heading{background:#dbe9e1;font-weight:700}header{display:flex;flex-direction:column;justify-content:center;gap:10px}code{font-size:13px;overflow-wrap:anywhere}small{font-size:12px;color:#61726b}.cell{min-height:110px;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;overflow:auto}.cell img{max-width:none;flex-shrink:0}.live-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.live-grid article{padding:22px;background:white}.live{font-size:44pt;margin-top:18px;min-height:100px;overflow:auto}footer{font-size:12px;overflow-wrap:anywhere;color:#61726b;margin-top:28px}@media(max-width:760px){.heading{display:none}section{grid-template-columns:1fr}header{grid-column:1}.live-grid{grid-template-columns:1fr}}
</style></head><body><main><h1>근호가 내용에 붙는 문제를 보정했습니다</h1><p>실제 한컴 PDF와 동일 크기로 비교한 결과입니다. 아래 세 열은 모두 같은 배율(${zoom}배)로 확대했으며, 수식 너비를 맞추기 위해 늘리거나 줄이지 않았습니다.</p><div class="note">이번 수정은 근호의 내부 여백, 서버의 글꼴 연결, 작은 선의 벡터 배치 정밀도입니다. 비교한 근호 윗선은 한컴 0.442pt · Qutex 0.445pt입니다. 자형은 Latin Modern을 유지하므로 한컴 HYhwpEQ와 모양이 완전히 같지는 않습니다. 숫자 3·7로 여백을 정한 뒤 다른 여섯 근호를 확인했습니다. 근호 모양과 일부 자형에는 차이가 남습니다. 일반 브라우저 화면의 픽셀 반올림은 정밀 SVG와 다릅니다.</div><p>기준은 Hwp 2018 / Hancom PDF로 생성된 별도 원본 문서입니다. 앞서 제공한 HWP와 동일 문서의 출력은 아닙니다. 이전 열은 기존 Latin Modern 글꼴을 현재와 같은 렌더러로 그려 글꼴 보정 효과만 비교합니다. <a href="../specimen/index.html">브라우저 MathML ↔ 서버 SVG 전체 비교</a></p><div class="heading"><span>수식</span><span>실제 한컴 HYhwpEQ</span><span>수정 전 글꼴</span><span>Qutex Math 0.2</span></div>${rows.join('')}<h2>현재 브라우저의 실제 글꼴</h2><p>아래는 SVG 이미지가 아닌 MathML입니다. 44pt로 직접 배치하므로 위의 11pt 확대 이미지와 픽셀 반올림이 다를 수 있습니다.</p><div class="live-grid">${browserRows}</div><footer>기준 PDF SHA-256: ${reference.source.sha256}<br>현재 SVG 글꼴 SHA-256: ${results[0].fontSha256}<br>개인 원본과 비교 이미지는 로컬에만 저장합니다.</footer></main></body></html>`);
console.log('artifacts/radicals/index.html');
