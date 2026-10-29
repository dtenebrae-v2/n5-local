import test from 'node:test';
import assert from 'node:assert/strict';
import { keyCombo, validShortcut } from '../static/js/training-shortcuts.js';
test('Shortcuts protect browser, input and search commands', () => {
  for (const combo of ['Ctrl+R','Meta+L','Ctrl+C','Ctrl+Shift+T','Alt+Enter','Alt+ArrowLeft','Shift+/','F5','Tab','Enter','Q',null]) assert.equal(validShortcut(combo), false, combo);
  for (const combo of ['Shift+Enter','Ctrl+ArrowRight','F1','F2','F3']) assert.equal(validShortcut(combo), true, combo);
  assert.equal(keyCombo({key:'ArrowRight',ctrlKey:true}), 'Ctrl+ArrowRight');
  assert.equal(keyCombo({key:'Shift',shiftKey:true}), null);
});
