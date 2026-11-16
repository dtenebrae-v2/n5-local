import { escapeHTML as esc } from './ui.js';

export function lessonFor(bank, id) {
  return bank.curriculum?.lessons.find(lesson => String(lesson.number) === String(id));
}

export function reviewFor(bank, id) {
  return bank.curriculum?.reviews?.find(review => review.id === id);
}

export function objectiveItems(bank, objective) {
  return bank.items.filter(q => objective.skillIds?.includes(q.skill) || objective.itemIds?.includes(q.id));
}

export function lessonItems(bank, id) {
  const review = reviewFor(bank, id);
  if (review) {
    const ids = new Set(review.lessonNumbers.flatMap(number => lessonItems(bank, number).map(q => q.id)));
    return bank.items.filter(q => ids.has(q.id));
  }
  const lesson = lessonFor(bank, id);
  if (!lesson) return [];
  const ids = new Set(lesson.objectives.flatMap(objective => objectiveItems(bank, objective).map(q => q.id)));
  return bank.items.filter(q => ids.has(q.id));
}

export function lessonPicker(bank, selected = '', {view='all', allowTopics=true} = {}) {
  if (!bank.curriculum) return '';
  const lesson = lessonFor(bank, selected);
  const review = reviewFor(bank, selected);
  const source = bank.curriculum.sources;
  const objectives = l => l.objectives.map(o => `<article><h3>${esc(o.label)}</h3><p>${esc(o.rule)}</p><p class="lesson-example">${esc(o.example)}</p></article>`).join('');
  const prompt=view==='reviews'?'Выберите повторение':'Выберите урок';
  return `<section class="prep-lessons" aria-labelledby="prep-lessons-title"><h2 id="prep-lessons-title">${view==='reviews'?'Повторение пяти уроков':'Уроки 1–25'}</h2>
    <label for="prep-lesson">${prompt}</label><select id="prep-lesson">${allowTopics?'<option value="">Выбрать по темам</option>':''}
    ${bank.curriculum.lessons.map(l => {
      const checkpoint = bank.curriculum.reviews?.find(r=>r.afterLesson===l.number);
      return `${view!=='reviews'?`<option value="${l.number}" ${l===lesson?'selected':''}>${l.number}. ${esc(l.title)}</option>`:''}${view!=='lessons'&&checkpoint?`<option value="${checkpoint.id}" ${checkpoint===review?'selected':''}>${esc(checkpoint.title)}</option>`:''}`;
    }).join('')}</select>
    ${lesson || review ? `<p>${review ? 'Смешанное занятие по пяти урокам. В каждом будут задания; после занятия — результат по каждому уроку.' : esc(lesson.description)}</p><details class="prep-lesson-rules"><summary>${review?'Правила пяти уроков':`Правила и примеры урока · ${lesson.objectives.length}`}</summary>
      ${review ? review.lessonNumbers.map(number=>{const l=lessonFor(bank,number);return `<details class="prep-review-rules"><summary>Урок ${number}. ${esc(l.title)}</summary>${objectives(l)}</details>`;}).join('') : objectives(lesson)}
      <p class="practice-help">Учебная последовательность приложения. Нумерация уроков не является официальной программой JLPT.</p>
      <div class="prep-rule-sources">${source.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('')}</div></details>` : '<p class="practice-help">Для каждого урока доступны правила, примеры и задания. Урок 4 посвящён кандзи.</p>'}
    </section>`;
}

export function reviewResults(bank, session) {
  const review = reviewFor(bank, session?.lesson);
  if (!review) return [];
  const answers = new Map((session.results || []).map(r=>[r.id,r]));
  return review.lessonNumbers.map(number=>{
    const questions = session.questions.filter(q=>q.reviewLesson===number);
    return {number, total:questions.length, answered:questions.filter(q=>answers.has(q.id)).length,
      correct:questions.filter(q=>answers.get(q.id)?.status==='correct').length};
  });
}

export function archiveReview(bank, progress, session, now=Date.now()) {
  if (!reviewFor(bank,session?.lesson) || session.index < session.questions.length
      || session.results.length !== session.questions.length || !session.questions.length) return false;
  const id=`${session.started}:${session.lesson}`;
  const runs = Array.isArray(progress.reviewRuns) ? progress.reviewRuns : [];
  if (runs.some(run=>run.id===id)) return false;
  const lessons=reviewResults(bank,session);
  progress.reviewRuns=[...runs,{id,review:session.lesson,at:now,lessons,
    total:session.questions.length,correct:lessons.reduce((sum,l)=>sum+l.correct,0)}].slice(-30);
  return true;
}

export function reviewBreakdown(bank, session) {
  const lessons = reviewResults(bank,session);
  return lessons.length ? `<section class="prep-review-results"><h3>Результат по урокам</h3><p>Верно без подсказки:</p><ul>${lessons.map(l=>`<li>Урок ${l.number}: ${l.correct} из ${l.total}</li>`).join('')}</ul></section>` : '';
}

export function reviewHistory(bank, progress) {
  const runs=Array.isArray(progress.reviewRuns)?progress.reviewRuns:[];
  if (!runs.length) return '';
  return `<details class="prep-review-history"><summary>Повторения по урокам · ${runs.length}</summary>${[...runs].reverse().map(run=>{
    const review=reviewFor(bank,run.review);
    return review?`<article><h3>${esc(review.title)}</h3><p>${esc(new Date(run.at).toLocaleDateString('ru-RU'))} · самостоятельно ${run.correct} из ${run.total}</p><ul>${run.lessons.map(l=>`<li>Урок ${l.number}: ${l.correct} из ${l.total}</li>`).join('')}</ul></article>`:'';
  }).join('')}</details>`;
}
