import { loadReading } from './library-progress.js';
import { loadWorkbookProgress } from './workbook-progress.js';
import { loadProgress } from './training-progress.js';
import { loadPreparation, troubleSkills, dueSkills, topicAssessment } from './preparation-progress.js';

export function homePage(catalog, storage = localStorage) {
  const base = catalog.base;
  const training = loadProgress(storage), preparation = loadPreparation(storage);
  const prep = preparation.session;
  const prepPath = prep?.lesson ? (String(prep.lesson).startsWith('review-') ? `${base}/course/reviews` : `${base}/course`) : `${base}/preparation`;
  const prepOngoing = Array.isArray(prep?.questions) && prep.questions.length && Number.isInteger(prep.index) && prep.index >= 0 && prep.index < prep.questions.length;
  const formsOngoing = training.session?.current && !training.session.finished;
  const resume = prepOngoing
    ? `<a class="primary home-cta" href="${prepPath}">Продолжить · задание ${prep.index + 1} из ${prep.questions.length}</a>`
    : formsOngoing ? `<a class="primary home-cta" href="${base}/practice">Продолжить слова и формы</a>` : '';
  const mistakes = troubleSkills(preparation).length;
  const due = dueSkills(preparation).length;
  const nextDue = Object.values(preparation.skills).map(skill => skill?.due).filter(value => Number.isFinite(value) && value > Date.now()).sort((a,b) => a-b)[0];
  const books = loadReading(storage).books;
  const reading = Object.entries(books).filter(([id, state]) => state?.updated && !state.completed).sort((a,b) => b[1].updated-a[1].updated)[0];
  const workbook = Object.entries(loadWorkbookProgress(storage).books || {}).find(([id, state]) => Array.isArray(state?.session?.keys) && Number.isInteger(state.session.index) && state.session.index >= 0 && state.session.index < state.session.keys.length);
  const savedLinks = [
    reading ? `<a href="${base}/library/${encodeURIComponent(reading[0])}">Продолжить чтение книги</a>` : '',
    workbook ? `<a href="${base}/workbooks/${encodeURIComponent(workbook[0])}">Продолжить упражнения по учебнику</a>` : '',
  ].join('');
  const lastExam = preparation.exams.filter(run => Number.isInteger(run?.total) && run.total > 0 && Number.isInteger(run.correct) && run.correct >= 0 && run.correct <= run.total).at(-1);
  const assessments = Object.keys(preparation.topics).map(id => topicAssessment(preparation,id));
  const strong = assessments.filter(topic => topic.state === 'good').length;
  const weak = assessments.filter(topic => topic.state === 'weak').length;
  const recommendation = resume ? '' : due
    ? `<h2>Повторение на сегодня</h2><p>Подошёл срок повторения: ${due}. Проверьте, что запомнилось.</p><a class="primary home-cta" href="${base}/preparation?mode=due">Повторить сегодня</a>`
    : mistakes
      ? `<h2>Разберите ошибки</h2><p>Правил для повторения: ${mistakes}.</p><a class="primary home-cta" href="${base}/preparation?mode=mistakes">Повторить ошибки</a>`
      : `<h2>Занятие по курсу</h2><p>Откройте урок, изучите правило и закрепите его в заданиях.</p><a class="primary home-cta" href="${base}/course">Открыть курс N5</a>`;
  return `<section class="home-intro"><h1>Моё обучение</h1>
    ${resume ? `<div class="home-resume"><h2>Вернуться к занятию</h2>${resume}</div>` : ''}
    ${recommendation}
    <a class="${resume || recommendation ? 'secondary' : 'primary'} home-cta" href="${base}/preparation?quick=1">Начать · 10 заданий</a>
    <p class="home-help">Смешанное занятие по темам N5. Ответы и объяснения после каждого вопроса.</p></section>
    ${savedLinks ? `<section class="home-card home-saved"><h2>Сохранённая работа</h2>${savedLinks}</section>` : ''}
    <section class="home-card home-saved" aria-labelledby="home-progress-title"><h2 id="home-progress-title">Прогресс и повторение</h2>
      <p>${assessments.length ? `Тем с устойчивым результатом: ${strong}. Нужна практика: ${weak}.` : 'После первых занятий здесь появятся результаты по темам.'}</p>
      <p>${mistakes ? `Правил с ошибками: ${mistakes}.` : 'Ошибки для повторения появятся после занятий.'} ${due ? `К повторению сегодня: ${due}.` : nextDue ? `Ближайшее повторение: ${new Date(nextDue).toLocaleDateString('ru-RU')}.` : ''}</p>
      ${mistakes ? `<a class="secondary home-cta" href="${base}/preparation?mode=mistakes">Повторить ошибки</a>` : ''}
      ${due ? `<a class="secondary home-cta" href="${base}/preparation?mode=due">Повторить сегодня</a>` : ''}
      ${lastExam ? `<p>Последний письменный пробник: ${lastExam.correct} из ${lastExam.total}. Это результат тренировки, а не оценка JLPT.</p>` : ''}
      <a href="${base}/progress">Подробные результаты →</a></section>
    <div class="home-grid">
      <section class="home-card"><h2>Курс N5</h2><p>25 уроков с правилами и заданиями. Повторение после каждых пяти уроков.</p><a href="${base}/course">Уроки 1–25 →</a><a href="${base}/course/workbook">Практика по тетради →</a><a href="${base}/course/reviews">Повторение по урокам →</a></section>
      <section class="home-card"><h2>Слова и формы</h2><p>Вспоминайте слова и вводите формы глаголов, прилагательных и существительных.</p><a href="${base}/practice">Тренировать слова и формы →</a></section>
      <section class="home-card"><h2>Словарь и правила</h2><p>Найдите слово, чтение или значение; откройте спряжения и грамматику.</p><a href="${base}/vocabulary/complete">Открыть словарь →</a><a href="${base}/grammar/verbs">Грамматика →</a></section>
      <section class="home-card"><h2>Проверка знаний</h2><p>Письменный пробник: лексика, грамматика и чтение с таймером. Без аудирования.</p><a href="${base}/workbooks">Учебник Sō-matome N5 →</a><a href="${base}/mock">Письменный пробник →</a><a href="${base}/exams">Экзаменационные варианты →</a></section>
      <section class="home-card"><h2>Аудирование</h2><p>Записи и задания находятся в экзаменационных вариантах. Доступность аудио указана у каждого варианта.</p><a href="${base}/exams">Выбрать вариант с аудио →</a></section>
      <section class="home-card"><h2>Чтение</h2><p>Книги на японском для начинающих.</p><a href="${base}/library">Книги Tadoku →</a></section>
    </div>`;
}
