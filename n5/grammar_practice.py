"""Validated, bundled grammar exercises independent of the user's vocabulary."""
import re
from n5.vocabulary import read_json, keys, text, require, url


def load_grammar(path):
    data = read_json(path)
    keys(data, {'topics', 'rules', 'exercises'}, set(), 'grammar')
    for name in data:
        require(isinstance(data[name], list) and data[name], name, 'expected non-empty array')
    topics, rules, ids = set(), set(), set()
    for topic in data['topics']:
        keys(topic, {'id', 'label'}, set(), 'topic')
        for value in topic.values():
            text(value, 'topic')
        require(topic['id'] not in topics, 'topic', 'duplicate ID')
        topics.add(topic['id'])
    for rule in data['rules']:
        keys(rule, {'id', 'topic', 'label', 'explanation', 'sources'}, set(), 'rule')
        for field in ['id', 'topic', 'label', 'explanation']:
            text(rule[field], 'rule.' + field)
        require(rule['id'] not in rules and rule['topic'] in topics, 'rule', 'duplicate ID or unknown topic')
        require(isinstance(rule['sources'], list) and rule['sources'], 'rule', 'sources required')
        for source in rule['sources']:
            url(source, 'rule.sources')
        rules.add(rule['id'])
    for task in data['exercises']:
        keys(task, {'id', 'rule', 'instruction', 'sentence', 'reading', 'translation', 'answers'}, set(), 'exercise')
        for field in ['id', 'rule', 'instruction', 'sentence', 'reading', 'translation']:
            text(task[field], 'exercise.' + field)
        require(task['id'].startswith('grammar:') and task['id'] not in ids and task['rule'] in rules, 'exercise', 'invalid ID or rule')
        ids.add(task['id'])
        require(isinstance(task['answers'], list) and task['answers'], 'exercise', 'answers required')
        readings = set()
        for answer in task['answers']:
            keys(answer, {'kana', 'written'}, set(), 'answer')
            text(answer['written'], 'answer.written')
            text(answer['kana'], 'answer.kana')
            require(re.fullmatch('[ぁ-ゖー]+', answer['kana']) and answer['kana'] not in readings, 'answer', 'expected unique hiragana answer')
            readings.add(answer['kana'])
    return data
