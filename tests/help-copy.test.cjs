const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const removed = [
  "使い方やレポート保存の確認を開いている間は、背景ページのスクロールが止まります。画面が低い場合は、ダイアログ内をスクロールすると末尾や保存・キャンセルに移動できます。閉じるボタンは上部に残ります。",
  "While Help or the report confirmation is open, the background page stays still. On short screens, scroll inside the dialog to reach the end or the Save and Cancel buttons. The close button stays at the top."
];
for (const file of ["src/index.template.html", "pptx-diff.html"]) {
  test(`${file}: user help omits implementation commentary`, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const text of removed) assert.ok(!html.includes(text), `Remove implementation copy from ${file}`);
  });
}
