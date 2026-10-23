import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString, optionsFor } from '../src/core.mjs';
import * as browser from '../src/browser.mjs';
import { DEFAULT_LOCALE, locales, resolveLocale, localeMacros, describeLocale } from '../src/locales.mjs';
import { renderToSVG } from '../src/svg.mjs';

const GEQ = '≥';
const LEQ = '≤';
const GEQQ = '≧';
const LEQQ = '≦';
const operators = mathml => [...mathml.matchAll(/<mo>([^<]*)<\/mo>/g)].map(match => match[1]);

// ₙCₖ: an empty base with subscript n, then an upright C with subscript k.
const LEFT_SUB = '<msub><mrow></mrow>';
const UPRIGHT_C = '<msub><mrow><mi mathvariant="normal">C</mi><mspace></mspace></mrow>';
const COMBINATION_RE = /<msub><mrow><\/mrow>[\s\S]*?<\/msub><msub><mrow><mi mathvariant="normal">C<\/mi>/;
function assertCombination(mathml, n, k) {
  assert.ok(mathml.includes(`${LEFT_SUB}${n}</msub>${UPRIGHT_C}${k}</msub>`), `expected ${n}C${k} in ${mathml}`);
  assert.doesNotMatch(mathml, /<mfrac|fence="true"/, 'no parenthesised binomial');
}

test('the default locale is Korean and the table lists every locale', () => {
  assert.equal(DEFAULT_LOCALE, 'ko');
  assert.deepEqual([...locales], ['ko', 'ja', 'tex']);
  assert.ok(Object.isFrozen(locales));
  assert.equal(renderToString(String.raw`\binom{5}{2}`), renderToString(String.raw`\binom{5}{2}`, { locale: 'ko' }));
  assert.equal(browser.DEFAULT_LOCALE, 'ko');
  assert.equal(browser.default.renderToString(String.raw`a\geqq b`), renderToString(String.raw`a\geq b`));
});

test('ko: every binomial command is the left-subscript combination ₙCₖ', () => {
  assertCombination(renderToString(String.raw`\binom{5}{2}`), '<mn>5</mn>', '<mn>2</mn>');
  assertCombination(renderToString(String.raw`\dbinom{n}{k}`, { displayMode: true }), '<mi>n</mi>', '<mi>k</mi>');
  assertCombination(renderToString(String.raw`\tbinom{n}{r}`), '<mi>n</mi>', '<mi>r</mi>');
  assertCombination(renderToString(String.raw`\binom{a+b}{3}`), '<mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow>', '<mn>3</mn>');
  // A power is written (ₙCₖ)²; a subscript attaches to the whole symbol rather
  // than failing as a double subscript.
  const squared = renderToString(String.raw`\binom{n}{k}^2`);
  assert.equal(squared, `<math><msup><mrow><mo fence="true" form="prefix" stretchy="true">(</mo><mrow>${LEFT_SUB}<mi>n</mi></msub>${UPRIGHT_C}<mi>k</mi></msub></mrow><mo fence="true" form="postfix" stretchy="true">)</mo></mrow><mn>2</mn></msup></math>`);
  assert.equal(renderToString(String.raw`\binom{n}{k} ^ 2`), squared);
  assert.ok(renderToString(String.raw`\binom{n}{k}_x`).startsWith(`<math><msub><mrow>${LEFT_SUB}`));
  assert.doesNotMatch(renderToString(String.raw`\binom{n}{k}+\binom{n}{k}`), /\(/);
  assertCombination(renderToString(String.raw`x^{\binom{n}{k}}`), '<mi>n</mi>', '<mi>k</mi>');
  // A parenthesised binomial is still available explicitly.
  assert.match(renderToString(String.raw`\genfrac(){0pt}{}{n}{k}`), /<mfrac linethickness="0px">/);
});

test('ko: ≥ and ≤ always have one bar, from commands, Unicode input and text', () => {
  const geq = String.raw`a\geq b,\ a\ge b,\ a\geqq b,\ a\geqslant b,\ a ≥ b,\ a ≧ b,\ a ⩾ b`;
  const leq = String.raw`a\leq b,\ a\le b,\ a\leqq b,\ a\leqslant b,\ a ≤ b,\ a ≦ b,\ a ⩽ b`;
  assert.deepEqual(operators(renderToString(geq)).filter(op => op !== ','), Array(7).fill(GEQ));
  assert.deepEqual(operators(renderToString(leq)).filter(op => op !== ','), Array(7).fill(LEQ));
  assert.match(renderToString(String.raw`\text{점수 ≧ 80, 나이 ≦ 19}`), /<mtext>점수\s≥\s80,\s나이\s≤\s19<\/mtext>/);
  // Negations are already one-bar glyphs upstream.
  assert.deepEqual(operators(renderToString(String.raw`a\ngeq b\ngeqq c\nleqq d`)), ['≱', '≱', '≰']);
});

test('ja: combinations are ₙCᵣ and ≧ ≦ always have two bars', () => {
  assertCombination(renderToString(String.raw`\binom{5}{2}`, { locale: 'ja' }), '<mn>5</mn>', '<mn>2</mn>');
  const source = String.raw`a\geq b\ge c\geqq d\geqslant e ≥ f ≧ g ⩾ h`;
  assert.deepEqual(operators(renderToString(source, { locale: 'ja' })), Array(7).fill(GEQQ));
  const lower = String.raw`a\leq b\le c\leqq d\leqslant e ≤ f ≦ g ⩽ h`;
  assert.deepEqual(operators(renderToString(lower, { locale: 'ja' })), Array(7).fill(LEQQ));
  assert.match(renderToString(String.raw`\text{x ≥ 0}`, { locale: 'ja' }), /<mtext>x\s≧\s0<\/mtext>/);
});

test('tex keeps upstream Temml notation', () => {
  const mathml = renderToString(String.raw`\binom{5}{2}`, { locale: 'tex' });
  assert.match(mathml, /<mo fence="true">\(<\/mo><mfrac linethickness="0px"><mn>5<\/mn><mn>2<\/mn><\/mfrac>/);
  assert.doesNotMatch(mathml, COMBINATION_RE);
  assert.deepEqual(operators(renderToString(String.raw`a\geq b\geqq c\geqslant d\leq e\leqq f\leqslant g`, { locale: 'tex' })),
    [GEQ, GEQQ, '⩾', LEQ, LEQQ, '⩽']);
  assert.deepEqual(localeMacros('tex'), {});
});

test('BCP 47 tags resolve by language; unknown locales fail clearly', () => {
  for (const [input, expected] of [['ko', 'ko'], ['ko-KR', 'ko'], ['KO_kr', 'ko'], ['ja-JP', 'ja'], [' ja ', 'ja'], ['TEX', 'tex']]) {
    assert.equal(resolveLocale(input), expected, input);
  }
  assert.equal(resolveLocale(), 'ko');
  assert.equal(resolveLocale(undefined), 'ko');
  for (const input of ['en', 'en-US', 'zh', '', 'tex-x', 'constructor', '__proto__', 'toString']) {
    assert.throws(() => resolveLocale(input), RangeError, input);
    assert.throws(() => renderToString('x', { locale: input }), RangeError, input);
  }
  for (const input of [null, 1, {}, ['ko']]) assert.throws(() => renderToString('x', { locale: input }), TypeError);
});

test('caller macros override locale macros without counting toward the macro limit', () => {
  const restored = renderToString(String.raw`\binom{n}{k}`, { macros: { '\\binom': '\\genfrac(){0pt}{}{#1}{#2}' } });
  assert.match(restored, /<mfrac linethickness="0px">/);
  assert.equal(renderToString(String.raw`a\geq b`, { locale: 'ja', macros: { '\\geq': '\\ge' } }).includes(GEQQ), true);
  const many = Object.fromEntries(Array.from({ length: 128 }, (_, index) => [`\\m${String.fromCharCode(97 + (index % 26))}${index}`, 'x']));
  assert.match(renderToString(String.raw`\binom{n}{k}`, { macros: many }), COMBINATION_RE);
  assert.throws(() => renderToString('x', { macros: { ...many, '\\extra': 'y' } }), /Too many macros/);
});

test('locale state never leaks between calls and tables are copies', () => {
  assert.ok(renderToString(String.raw`a\geq b`, { locale: 'ja' }).includes(GEQQ));
  assert.ok(renderToString(String.raw`a\geq b`).includes(GEQ));
  assert.ok(renderToString(String.raw`\gdef\binom#1#2{X}\binom{1}{2}`).includes('X'));
  assertCombination(renderToString(String.raw`\binom{1}{2}`), '<mn>1</mn>', '<mn>2</mn>');
  const copy = localeMacros('ko');
  copy['\\binom'] = 'changed';
  assert.notEqual(localeMacros('ko')['\\binom'], 'changed');
  assert.notEqual(optionsFor('x').macros, optionsFor('x').macros);
  assert.deepEqual(describeLocale('ja-JP').locale, 'ja');
  assert.match(describeLocale().description, /ₙCₖ/);
});

test('annotations keep the original TeX source', () => {
  const mathml = renderToString(String.raw`\binom{5}{2}\geqq 1`, { annotate: true });
  assert.match(mathml, /<annotation encoding="application\/x-tex">\\binom\{5\}\{2\}\\geqq 1<\/annotation>/);
  assert.match(mathml, COMBINATION_RE);
});

test('infix \\choose is parsed by Temml directly and is not remapped (known limitation)', () => {
  assert.match(renderToString(String.raw`{n \choose k}`), /<mfrac linethickness="0px">/);
});

test('callers can only tighten expansion and size limits', () => {
  assert.deepEqual(optionsFor('x', { maxExpand: 500, maxSize: [10, 120] }).maxSize, [10, 120]);
  assert.equal(optionsFor('x', { maxExpand: 500 }).maxExpand, 500);
  assert.deepEqual(optionsFor('x').maxSize, [100, 1000]);
  for (const options of [{ maxExpand: 0 }, { maxExpand: 1001 }, { maxExpand: 1.5 }, { maxExpand: Infinity }, { maxSize: [101, 10] },
    { maxSize: [10, 1001] }, { maxSize: [10] }, { maxSize: [0, 10] }, { maxSize: [NaN, 10] }, { maxSize: ['10', 10] }]) {
    assert.throws(() => optionsFor('x', options), RangeError, JSON.stringify(options));
  }
  assert.throws(() => renderToString(String.raw`\a`, { macros: { '\\a': '\\b', '\\b': 'x' }, maxExpand: 1 }), /expan/i);
});

test('locale reaches the SVG renderers', async () => {
  const ko = await renderToSVG(String.raw`\binom{5}{2}\ge 0`, { backend: 'mathjax' });
  const ja = await renderToSVG(String.raw`\binom{5}{2}\ge 0`, { backend: 'mathjax', locale: 'ja' });
  const tex = await renderToSVG(String.raw`\binom{5}{2}\ge 0`, { backend: 'mathjax', locale: 'tex' });
  assert.match(ko.mathml, COMBINATION_RE);
  assert.ok(ko.mathml.includes(GEQ) && !ko.mathml.includes(GEQQ));
  assert.ok(ja.mathml.includes(GEQQ));
  assert.match(tex.mathml, /<mfrac/);
  assert.notEqual(ko.svg, tex.svg);
  assert.ok(ko.height < tex.height, 'ₙCₖ is shorter than a stacked binomial');
});
