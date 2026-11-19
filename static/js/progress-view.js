import { getJSON } from './api.js';
import { escapeHTML as esc } from './ui.js';
import { loadPreparation, hydrateSkills, topicAssessment, dueSkills, troubleSkills } from './preparation-progress.js';
import { preparationStats } from './preparation-view.js';

export async function mountProgress(root, signal) {
  root.innerHTML = '<p class="loading">Загружаем прогресс…</p>';
  const bank = await getJSON('/api/mock-exam', signal);
  if (signal.aborted) return;
  const progress = loadPreparation();
  hydrateSkills(progress, bank);
  const due = dueSkills(progress).length, mistakes = troubleSkills(progress).length;
  root.innerHTML = `<p><a href="/jlpt/n5">← Моё обучение</a></p><h1>Подробные результаты</h1><p>Результаты занятий в этом браузере. Они помогают выбрать следующую тему и не являются оценкой JLPT.</p>
    <section class="home-card"><h2>Повторение</h2><p>По расписанию: ${due}. С нерешёнными ошибками: ${mistakes}. Эти группы могут пересекаться.</p><div class="practice-actions">${due ? '<a class="primary" href="/jlpt/n5/preparation?mode=due">Повторить сегодня</a>' : ''}${mistakes ? '<a class="secondary" href="/jlpt/n5/preparation?mode=mistakes">Разобрать ошибки</a>' : ''}<a class="secondary" href="/jlpt/n5/course">Продолжить курс</a></div></section>
    <section class="progress-topics"><h2>Темы</h2><div class="home-grid">${bank.topics.map(topic => {
      const assessment = topicAssessment(progress, topic.id);
      const label = {insufficient:'Пока мало данных',weak:'Нужна практика',good:'Хороший результат'}[assessment.state];
      return `<article class="home-card"><h3>${esc(topic.label)}</h3><p>${label}${assessment.count ? ` · самостоятельно ${assessment.correct} из ${assessment.count}` : ''}</p><a href="/jlpt/n5/preparation?topic=${encodeURIComponent(topic.id)}">Тренировать тему →</a></article>`;
    }).join('')}</div></section><section class="progress-details"><h2>Подробные результаты</h2>${preparationStats(progress,bank)}</section>`;
}
