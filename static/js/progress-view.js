import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { hydrateSkills, topicAssessment, dueSkills, troubleSkills } from './preparation-progress.js';
import { preparationStats } from './preparation-view.js';
import { learningOverview, overviewCards, resumeLinks } from './learning-overview.js';

export async function mountProgress(root, signal) {
  root.innerHTML = '<p class="loading">Загружаем прогресс…</p>';
  const [bank,catalog] = await Promise.all([getJSON('/api/mock-exam', signal),getJSON('/api/catalog',signal)]);
  if (signal.aborted) return;
  const overview = learningOverview(globalThis.localStorage,catalog.base,Date.now(),catalog);
  const progress = overview.preparation;
  hydrateSkills(progress, bank);
  const due = dueSkills(progress).length, mistakes = troubleSkills(progress).length;
  const started = bank.topics.filter(topic=>progress.topics[topic.id]?.attempts || topicAssessment(progress,topic.id).count);
  const rest = bank.topics.filter(topic=>!started.includes(topic));
  started.sort((a,b)=>{
    const rank={weak:0,insufficient:1,good:2};
    return rank[topicAssessment(progress,a.id).state]-rank[topicAssessment(progress,b.id).state];
  });
  const topicCard = topic => {
    const assessment = topicAssessment(progress,topic.id);
    const label = {insufficient:'Продолжайте практику',weak:'Нужна практика',good:'Хороший результат'}[assessment.state];
    return `<article class="home-card"><h3>${esc(topic.label)}</h3><p>${label}${assessment.count ? ` · самостоятельно ${assessment.correct} из ${assessment.count}` : ''}</p><a href="/jlpt/n5/preparation?topic=${encodeURIComponent(topic.id)}">Тренировать тему →</a></article>`;
  };
  root.innerHTML = `<p><a href="/jlpt/n5">← Моё обучение</a></p><h1>Подробные результаты</h1><p>Ваши занятия, повторение и результаты.</p>
    <section class="home-card"><h2>Повторение</h2><p>${due||mistakes?`К повторению сегодня: ${due}. С ошибками: ${mistakes}.`:'После занятий здесь появится план повторения.'}${overview.review.nextDue ? ` Ближайшее следующее повторение: ${new Date(overview.review.nextDue).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'})}.` : ''}</p><div class="practice-actions">${due ? '<a class="primary" href="/jlpt/n5/preparation?mode=due">Повторить сегодня</a>' : ''}${mistakes ? '<a class="secondary" href="/jlpt/n5/preparation?mode=mistakes">Разобрать ошибки</a>' : ''}<a class="secondary" href="/jlpt/n5/course">Продолжить курс</a></div></section>
    ${overview.resumptions.length ? `<section><h2>Продолжить с сохранённого места</h2><div class="home-grid">${resumeLinks(overview)}</div></section>` : ''}
    <section class="progress-topics"><h2>Все разделы</h2>${overviewCards(overview)}</section>
    ${started.length ? `<section class="progress-topics"><h2>Ваши темы</h2><div class="home-grid">${started.map(topicCard).join('')}</div></section>` : '<p class="progress-empty">После первого занятия здесь появятся темы и результаты.</p>'}
    ${rest.length ? `<details class="progress-unstarted"><summary>Ещё не начаты · ${rest.length}</summary><nav aria-label="Не начатые темы">${rest.map(topic=>`<a href="/jlpt/n5/preparation?topic=${encodeURIComponent(topic.id)}">${esc(topic.label)} →</a>`).join('')}</nav></details>` : ''}
    <details class="progress-details"><summary>Как считаются результаты</summary><p>Результаты сохраняются в этом браузере. У каждого вида практики своя оценка; общий балл готовности к JLPT не вычисляется. Повторение по сроку и по ошибкам может включать одни и те же задания.</p></details><details class="progress-details"><summary>История занятий и подробная статистика</summary>${preparationStats(progress,bank)}</details>`;
}
