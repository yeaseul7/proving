import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMathMarkdown } from '../lib/math-markdown.ts';
test('일반적인 인라인·블록 수식 표기를 지원한다',()=>{
 assert.equal(normalizeMathMarkdown('식 \\(x^2\\)과 \\[ \\frac{1}{2} \\]'),'식 $x^2$과 \n$$\n\\frac{1}{2}\n$$\n');
 assert.equal(normalizeMathMarkdown('$x$\n\n$$\nx^2\n$$'),'$x$\n\n$$\nx^2\n$$');
});
test('코드 블록과 인라인 코드의 수식 표기를 변경하지 않는다',()=>{
 const source='```python\nvalue = "\\(x\\)"\n```\n`\\[raw\\]` 그리고 \\(y\\)';
 assert.equal(normalizeMathMarkdown(source),'```python\nvalue = "\\(x\\)"\n```\n`\\[raw\\]` 그리고 $y$');
});
