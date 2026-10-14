# N5 Local

Локальный словарь японского языка с грамматикой и проверкой форм. Работает без внешних сервисов.

## Запуск

```sh
docker compose up -d --build
```

Открыть `http://localhost:8095` или `http://<IP сервера>:8095` с другой машины.
`N5_PORT` меняет порт, `N5_HOST=127.0.0.1` ограничивает доступ текущим компьютером.

## Словарь

Кнопка «Добавить слово» открывает форму. Поля со звёздочкой обязательны; группа зависит от раздела. Новое слово также появляется в общем словаре.

В Docker словарь хранится в volume `vocabulary`, файл `/app/storage/vocabulary.json`. При первом запуске он заполняется из встроенного словаря. Перезапуск и пересборка сохраняют изменения; `docker compose down -v` удаляет volume. Последующие обновления встроенного словаря не перезаписывают сохранённый.

Без Docker:

```sh
python server.py
```

По умолчанию используются `127.0.0.1:8095` и `data/vocabulary.json`. Переменные `HOST`, `PORT`, `N5_VOCABULARY` меняют адрес и путь к словарю.

## Проверки

```sh
python -m n5.vocabulary validate
python -m unittest -q test_server.py test_repository.py test_store.py
npm run test:forms
npm run test:ui
```

Для браузерных тестов нужны Playwright и Chromium: `npm install`, `npx playwright install chromium`.
