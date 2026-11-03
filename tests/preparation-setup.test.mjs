import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TOPIC_GROUPS, preparationSettings, preparationTopicChoices} from '../static/js/preparation-setup.js';
import {emptyProgress} from '../static/js/preparation-progress.js';
const bank=JSON.parse(readFileSync(new URL('../data/mock-exam.json',import.meta.url)));

test('each preparation topic is reachable in exactly one group',()=>{
  const ids=TOPIC_GROUPS.flatMap(g=>g.topics);
  assert.equal(ids.length,new Set(ids).size);
  assert.deepEqual(new Set(ids),new Set(bank.topics.map(t=>t.id)));
});
test('topic search crosses groups and retains the selected topic',()=>{
  const settings=preparationSettings({category:'words',query:'част',topic:'particles'},bank);
  const html=preparationTopicChoices(bank,emptyProgress(),settings);
  assert.match(html,/data-topic="particles" aria-pressed="true"/);
  assert.doesNotMatch(html,/data-topic="kanji"/);
});
test('invalid saved setup falls back to available choices',()=>{
  assert.deepEqual(preparationSettings({mode:'__proto__',topic:'missing',category:'old',count:999,query:[]},bank),
    {mode:'all',topic:'',category:'words',count:10,query:''});
});
