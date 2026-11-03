import { escapeHTML as esc } from './ui.js';
import { topicAssessment, dueSkills, troubleSkills, weakTopics } from './preparation-progress.js';

export const TOPIC_GROUPS = [
  {id:'words',label:'Слова и кандзи',topics:['kanji','vocabulary','numbers','dates','demonstratives']},
  {id:'forms',label:'Формы слов',topics:['verb-forms','tense','plain','adjectives','adverbs','ongoing','change']},
  {id:'constructions',label:'Конструкции',topics:['particles','permission','requests','desire','ability','sequence','invitation','comparison','existence','giving','reasons','preferences','purpose','listing','obligation','experience','opinion','quantity','already','when','indefinite','ending']},
  {id:'texts',label:'Работа с текстом',topics:['word-order','text-grammar','reading']},
];
export const MODE_LABELS = {all:'По темам',mistakes:'Ошибки',weak:'Слабые темы',due:'Повторить сегодня'};
export function taskCount(number) {
  const form=new Intl.PluralRules('ru').select(number);
  return `${number} ${{one:'задание',few:'задания',many:'заданий'}[form] || 'задания'}`;
}

export function preparationSettings(saved, bank) {
  return {
    mode:Object.hasOwn(MODE_LABELS,saved?.mode) ? saved.mode : 'all',
    topic:bank.topics.some(t=>t.id===saved?.topic) ? saved.topic : '',
    category:TOPIC_GROUPS.some(g=>g.id===saved?.category) ? saved.category : 'words',
    count:[5,10,20].includes(saved?.count) ? saved.count : 10,
    query:typeof saved?.query === 'string' ? saved.query.slice(0,100) : '',
  };
}

export function preparationModes(progress, mode) {
  const mistakes=troubleSkills(progress).length, weak=weakTopics(progress).length, due=dueSkills(progress).length;
  return `<div class="prep-mode-grid" role="group" aria-label="Режим занятия">${[
    ['all','Одна тема или смешанное занятие',true],
    ['mistakes',mistakes ? `Слова и правила с ошибками: ${mistakes}` : 'Пока нет ошибок для повторения',!!mistakes],
    ['weak',weak ? `Темы, которым нужна практика: ${weak}` : 'Пока нет слабых тем',!!weak],
    ['due',due ? `К повторению по расписанию: ${due}` : 'На сегодня повторений нет',!!due],
  ].map(([id,description,available])=>`<button type="button" class="prep-mode-card" data-start="${id}" aria-pressed="${mode===id}" ${available?'':'disabled'}><strong>${MODE_LABELS[id]}</strong><span>${description}</span></button>`).join('')}</div>`;
}

export function preparationTopicChoices(bank,progress,settings) {
  const query=settings.query.trim().toLocaleLowerCase('ru-RU');
  const group=TOPIC_GROUPS.find(g=>g.id===settings.category);
  const topics=bank.topics.filter(t=>query ? t.label.toLocaleLowerCase('ru-RU').includes(query) : group.topics.includes(t.id));
  const assessment = {insufficient:'Пока мало данных',weak:'Нужна практика',good:'Хороший результат'};
  return `<p id="prep-topic-count" role="status">${query ? `По всем темам найдено: ${topics.length}` : esc(group.label)+' · '+topics.length}</p><div class="prep-topic-grid" role="group" aria-label="Тема занятия">${topics.map(t=>{
    const state=topicAssessment(progress,t.id).state, count=bank.items.filter(q=>q.topic===t.id).length;
    return `<button type="button" class="prep-topic-card" data-topic="${esc(t.id)}" aria-pressed="${settings.topic===t.id}"><strong>${esc(t.label)}</strong><span>${taskCount(count)}</span><small data-assessment="${esc(state)}">${assessment[state] || 'Хороший результат'}</small></button>`;
  }).join('')}</div>${topics.length ? '' : '<p>Темы не найдены. Измените запрос или очистите поиск.</p>'}`;
}
