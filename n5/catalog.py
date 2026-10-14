"""Single catalog shared by server routing and browser navigation."""
import json

BASE = '/jlpt/n5'


class Catalog:
    def __init__(self, data_directory, repository_factory):
        definitions = json.loads((data_directory / 'catalog.json').read_text(encoding='utf-8'))
        self.repository = repository_factory(definitions['collections'])
        lessons = json.loads((data_directory / 'lessons.json').read_text(encoding='utf-8'))
        self.lessons = {lesson['path']: lesson for lesson in lessons}
        collections = []
        for definition in definitions['collections']:
            item = dict(definition)
            item['path'] = f"{BASE}/vocabulary/{item['id']}"
            item['count'] = self.repository.count(item['id'])
            collections.append(item)
        sections = []
        for definition in definitions['sections']:
            children = [c for c in collections if c.get('parent') == definition['id']]
            sections.append({
                **definition, 'path': f"{BASE}/vocabulary/{definition['id']}",
                'children': [c['id'] for c in children],
                'count': sum(c['count'] for c in children),
            })
        lesson_metadata = [{**item, 'path': f"{BASE}/{item['id']}"} for item in definitions['lessons']]
        if {item['path'] for item in lesson_metadata} != self.lessons.keys():
            raise ValueError('Grammar catalog does not match lesson data')
        self.public = {
            'base': BASE, 'collections': collections,
            'sections': sections, 'lessons': lesson_metadata,
        }
        self.routes = {'/', '/jlpt', BASE, f'{BASE}/vocabulary', f'{BASE}/practice'}
        self.routes.update(item['path'] for item in collections + sections + lesson_metadata)
