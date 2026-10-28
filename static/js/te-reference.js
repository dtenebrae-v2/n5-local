import { highlightedRule, changed } from './form-highlight.js';
import { escapeHTML as esc } from './ui.js';

export function teReference() {
  const rows = [
    ['Godan · группа 1', 'う・つ・る → って', 'もらう → もらって / まつ → まって / とる → とって'],
    ['Godan · группа 1', 'ぬ・ぶ・む → んで', 'しぬ → しんで / とぶ → とんで / よむ → よんで'],
    ['Godan · группа 1', 'く → いて', 'かく → かいて'],
    ['Godan · группа 1', 'ぐ → いで', 'およぐ → およいで'],
    ['Godan · группа 1', 'す → して', 'はなす → はなして'],
    ['Ichidan · группа 2', 'る → て', 'たべる → たべて / みる → みて'],
    ['Неправильные · группа 3', 'する → して / くる → きて', 'する → して / 来る（くる）→ 来て（きて）'],
    ['Исключение', 'いく → いって', '行く（いく）→ 行って（いって）'],
  ];
  return `<h3>Соединительная て-форма</h3>
    <p>Замените окончание словарной формы по таблице. У глаголов на る учитывайте группу: とる → とって, но たべる → たべて.</p>
    <div class="table-scroll"><table class="rules-table te-rules-table"><thead><tr><th>Группа</th><th>Замена</th><th>Примеры</th></tr></thead>
    <tbody>${rows.map(row => `<tr>${row.map((cell, index) => `<td>${index ? highlightedRule(cell) : esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p>て-форма соединяет действия: 朝ご飯を食べ${changed('て')}、学校に行きます — «Завтракаю и иду в школу». Время и вежливость задаёт заключительный глагол.</p>
    <p><a href="https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf" target="_blank" rel="noreferrer">Japan Foundation · Irodori: Elementary 1, Lesson 1, L1-18</a></p>`;
}
