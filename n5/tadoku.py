"""Tadoku catalogue extraction. Only explicitly licensed, original files are imported."""
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit
import re

ORIGIN = 'https://tadoku.org'
LICENSE = 'https://creativecommons.org/licenses/by-nc-nd/4.0/'
TERMS = 'https://tadoku.org/japanese/en/free-books-en/note-en/'
AUDIO_SOURCE = 'https://tadoku.org/japanese/audio-downloads/wtb/'


@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def walk(self, tag=None, cls=None):
        if (tag is None or self.tag == tag) and (cls is None or cls in self.attrs.get('class', '').split()):
            yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk(tag, cls)

    def text(self):
        if self.tag in {'rt', 'rp', 'script', 'style'}:
            return ''
        return ''.join(child.text() if isinstance(child, Node) else child for child in self.children)


class Document(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def clean(node):
    return re.sub(r'\s+', ' ', node.text()).strip()


def approved_url(value, asset=False):
    url = urlsplit(urljoin(ORIGIN, value))
    if url.scheme != 'https' or url.hostname != 'tadoku.org' or url.port or url.username or url.password:
        raise ValueError('Only original HTTPS Tadoku URLs are permitted')
    if asset and not url.path.startswith('/japanese/wp-content/uploads/'):
        raise ValueError('Unexpected Tadoku asset path')
    return urlunsplit((url.scheme, url.netloc, url.path, '', ''))


def candidates(html):
    result = []
    for card in Document(html).root.walk(cls='freebooks-book-item'):
        if card.attrs.get('data-level') not in {'l1','l2'}:
            continue
        if LICENSE not in card.attrs.get('data-keywords', ''):
            continue
        links = list(card.walk('a'))
        url = next((a.attrs['href'] for a in links if re.search(r'/book/\d+/?$', a.attrs.get('href',''))), None)
        if not url:
            continue
        result.append({'url':approved_url(url), 'level':int(card.attrs['data-level'][1]),
                       'has_audio':any('audio' in img.attrs.get('src','') for img in card.walk('img'))})
    return list({item['url']:item for item in result}.values())


def parse_book(html, source, narrators=None):
    root = Document(html).root
    note = next(root.walk(cls='bd-note'), None)
    if note is None or not any(a.attrs.get('href','').rstrip('/') == LICENSE.rstrip('/') for a in note.walk('a')):
        raise ValueError('No explicit CC BY-NC-ND 4.0 notice for this book')
    source = approved_url(source)
    title = clean(next(root.walk('h1')))
    level = next((int(m.group(1)) for a in root.walk('a')
                  if (m := re.fullmatch(r'Level ([12])', a.attrs.get('title') or clean(a)))), None)
    if level not in {1,2}:
        raise ValueError('Only levels 1 and 2 may be imported')
    author = next(root.walk(cls='bd-author'), None)
    credits = [clean(li) for li in author.walk('li')] if author else []
    if not credits:
        raise ValueError('Missing authorship credits')
    metadata = {}
    for tr in root.walk('tr'):
        th, td = next(tr.walk('th'), None), next(tr.walk('td'), None)
        if th and td:
            metadata[clean(th)] = clean(td)
    links = list(root.walk('a'))
    pdfs = {}
    for a in links:
        if urlsplit(a.attrs.get('href','')).path.lower().endswith('.pdf'):
            label = clean(a)
            if 'PDF' in label:
                key = 'print' if '印刷' in label or 'print' in label.lower() else 'pdf'
                pdfs.setdefault(key, approved_url(a.attrs['href'], asset=True))
    if 'pdf' not in pdfs:
        raise ValueError('Missing original screen PDF')
    book_id = re.search(r'/book/(\d+)', source).group(1)
    book = {'id':book_id, 'title':title, 'level':level, 'credits':credits,
            'publisher':next((v for k,v in metadata.items() if 'Publisher' in k), 'NPO多言語多読'),
            'pages':int(next((v for k,v in metadata.items() if 'Pages' in k), '0') or 0),
            'source':source, 'license':{'id':'CC-BY-NC-ND-4.0','url':LICENSE,'evidence':source,'terms':TERMS},
            'assets':{key:{'url':value,'filename':f'{book_id}-{key}.pdf','license':'CC-BY-NC-ND-4.0'} for key,value in pdfs.items()}}
    # Audio is not silently relabelled as CC: only the official personal-study downloads
    # with an identified narrator are admitted. They are not packaged in the application.
    audio_url = next((approved_url(a.attrs['href'], asset=True) for a in links
                      if urlsplit(a.attrs.get('href','')).path.lower().endswith('.mp3')
                      and urlsplit(urljoin(ORIGIN,a.attrs['href'])).hostname == 'tadoku.org'), None)
    narration = (narrators or {}).get(book_id)
    if audio_url and narration:
        book['assets']['audio'] = {'url':audio_url,'filename':f'{book_id}-audio.mp3',
            'permission':'personal-learning-download','rights_holder':'NPO多言語多読',
            'narrator':narration,'evidence':AUDIO_SOURCE}
    elif audio_url:
        book['audio_source'] = source
    return book


def parse_narrators(html):
    result = {}
    for tr in Document(html).root.walk('tr'):
        cells = [n for n in tr.children if isinstance(n,Node) and n.tag=='td']
        if len(cells) < 4:
            continue
        match = next((re.search(r'/book/(\d+)', a.attrs.get('href','')) for a in cells[1].walk('a')), None)
        if match and clean(cells[-1]):
            result[match.group(1)] = clean(cells[-1])
    return result
