import { loadProgress } from './training-progress.js';
import { loadPreparation, troubleSkills, dueSkills } from './preparation-progress.js';

export function homePage(catalog, storage = localStorage) {
  const base = catalog.base;
  const training = loadProgress(storage), preparation = loadPreparation(storage);
  const prep = preparation.session;
  const prepOngoing = Array.isArray(prep?.questions) && prep.questions.length && Number.isInteger(prep.index) && prep.index >= 0 && prep.index < prep.questions.length;
  const formsOngoing = training.session?.current && !training.session.finished;
  const resume = prepOngoing
    ? `<a class="primary home-cta" href="${base}/preparation">Продолжить · задание ${prep.index + 1} из ${prep.questions.length}</a>`
    : formsOngoing ? `<a class="primary home-cta" href="${base}/practice">Продолжить слова и формы</a>` : '';
  const mistakes = troubleSkills(preparation).length;
  const due = dueSkills(preparation).length;
  return `<section class="home-intro"><p class="eyebrow">ЯПОНСКИЙ · JLPT N5</p><h1>Моё обучение</h1>
    <p>Небольшое занятие каждый день. Выберите, что потренировать сегодня.</p>
    ${resume ? `<div class="home-resume"><h2>Вернуться к занятию</h2>${resume}</div>` : ''}
    <a class="${resume ? 'secondary' : 'primary'} home-cta" href="${base}/preparation?quick=1">Начать · 10 заданий</a>
    <p class="home-help">Смешанное занятие по темам N5. Ответы и объяснения после каждого вопроса.</p></section>
    <div class="home-grid">
      <section class="home-card"><h2>Повторение</h2><p>${mistakes ? `Правил с ошибками: ${mistakes}.` : 'Ошибки для повторения появятся после занятий.'} ${due ? `К повторению сегодня: ${due}.` : ''}</p>
        ${mistakes ? `<a class="secondary home-cta" href="${base}/preparation?mode=mistakes">Повторить ошибки</a>` : ''}
        ${due ? `<a class="secondary home-cta" href="${base}/preparation?mode=due">Повторить сегодня</a>` : ''}
        <a href="${base}/preparation">Темы и прогресс →</a></section>
      <section class="home-card"><h2>Слова и формы</h2><p>Вспоминайте слова и вводите формы глаголов, прилагательных и существительных.</p><a href="${base}/practice">Тренировать слова и формы →</a></section>
      <section class="home-card"><h2>Словарь и правила</h2><p>Найдите слово, чтение или значение; откройте спряжения и грамматику.</p><a href="${base}/vocabulary/complete">Открыть словарь →</a><a href="${base}/grammar/verbs">Грамматика →</a></section>
      <section class="home-card"><h2>Подготовка и экзамены N5</h2><p>Занимайтесь по учебнику, проходите тренировочный тест или отдельные экзаменационные варианты с аудио.</p><a href="${base}/workbooks">Учебник Sō-matome N5 →</a><a href="${base}/mock">Пробный экзамен →</a><a href="${base}/exams">Экзаменационные варианты →</a></section>
      <section class="home-card"><h2>Чтение</h2><p>Книги на японском для начинающих.</p><a href="${base}/library">Книги Tadoku →</a></section>
    </div>`;
}
