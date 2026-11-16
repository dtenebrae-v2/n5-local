#!/usr/bin/env python3
"""Import a personally supplied course workbook into standalone local exercises."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata
import xml.etree.ElementTree as ET

# Source page ranges: lesson, translation questions, translation answers.
RANGES = [('1',9,10,110,110),('2',12,13,111,111),('3',19,20,113,114),
 ('5',26,27,115,115),('review-1-5',28,29,116,117),('6',30,31,118,118),
 ('7',34,35,119,120),('8',39,39,121,122),('9',41,42,123,124),('10',44,45,125,126),
 ('review-6-10',46,47,127,128),('11',50,50,129,130),('12',52,52,131,132),
 ('13',54,55,133,134),('14',57,57,135,136),('15',58,59,137,138),
 ('review-11-15',61,62,139,140),('16',65,66,141,142),('17',68,70,143,144),
 ('18',72,73,145,146),('19',75,77,147,148),('20',79,81,149,150),
 ('review-16-20',83,85,151,152),('21',88,89,153,154),('22',91,92,155,156),
 ('23',94,96,157,158),('24',98,99,159,160),('25',101,103,161,162),
 ('review-21-25',105,107,163,164)]
HEADER = r'Выполните\s+письменный\s+перевод[\s\S]*?:'
# Worksheet unit, question pages, answer page, start marker. These retain visual tasks.
WORKSHEETS = [('4',[21],114,'Запишите порядок'),('review-1-5',[28],116,'Запишите иероглифы'),
 ('7',[33,34],119,'Напишите чтения'),('10',[43,44],125,'Запишите порядок'),
 ('review-6-10',[46],127,'Запишите иероглифы'),('11',[49],129,'Запишите пропущенные'),
 ('12',[51],131,'Запишите пропущенные'),('13',[54],133,'漢字'),
 ('14',[56],135,'Запишите порядок'),('15',[58],137,'Запишите пропущенные'),
 ('review-11-15',[60],139,'Запишите иероглифы'),('16',[65],141,'Запишите порядок'),
 ('17',[68],143,'Запишите пропущенные'),('18',[72],145,'Запишите порядок'),
 ('19',[75],147,'Запишите пропущенные'),('20',[79],149,'Запишите порядок'),
 ('review-16-20',[82],151,'Запишите иероглифы'),('21',[87],153,'Вставьте подходящие'),
 ('22',[90],155,'Запишите порядок'),('23',[94],157,'Запишите пропущенные'),
 ('24',[97,98],159,'Запишите пропущенные'),('25',[101],161,'Запишите пропущенные'),
 ('review-21-25',[104],163,'Запишите иероглифы')]
DIGITS = ['', 'いち','に','さん','よん','ご','ろく','なな','はち','きゅう']

def number_reading(n):
    if not 0 < n < 10000:
        raise ValueError('Number outside reviewed range')
    parts=[]
    for divisor, suffix, irregular in [(1000,'せん',{1:'せん',3:'さんぜん',8:'はっせん'}),
                                      (100,'ひゃく',{1:'ひゃく',3:'さんびゃく',6:'ろっぴゃく',8:'はっぴゃく'}),
                                      (10,'じゅう',{1:'じゅう'})]:
        d,n=divmod(n,divisor)
        if d:parts.append(irregular.get(d,DIGITS[d]+suffix))
    return ''.join(parts)+DIGITS[n]

def number_written(n):
    result=''
    for value,symbol in [(1000,'千'),(100,'百'),(10,'十'),(1,'')]:
        d,n=divmod(n,value)
        if d:result+=('' if d==1 and value>1 else '一二三四五六七八九'[d-1])+symbol
    return result

def clock_readings(hour,minute):
    h={4:'よ',7:'しち',9:'く',14:'じゅうよ',17:'じゅうしち',19:'じゅうく'}.get(hour,number_reading(hour))+'じ'
    if not minute:return [h]
    tens,ones=divmod(minute,10)
    if not ones:
        forms=[('' if tens==1 else DIGITS[tens])+'じゅっぷん',('' if tens==1 else DIGITS[tens])+'じっぷん']
    else:
        end={1:['いっぷん'],2:['にふん'],3:['さんぷん'],4:['よんぷん'],5:['ごふん'],6:['ろっぷん'],7:['ななふん'],8:['はっぷん','はちふん'],9:['きゅうふん']}[ones]
        forms=[(number_reading(tens*10) if tens else '')+v for v in end]
    return [h+s for s in forms]+([h+'はん'] if minute==30 else [])

def text_parts(pages,a,b):
    result=[];active=False
    for page in range(a,b+1):
        s=pages[page-1]
        if not active:
            header=re.search(HEADER,s)
            if not header:continue
            s=s[header.end():];active=True
        # Stop before another lesson, not just before a page footer.
        s=re.split(r'第\s*\d+\s*課|Ответы см\.',s)[0]
        s='\n'.join(line for line in s.splitlines() if line.strip()!=str(page))
        for block in re.split(r'\n\s*\n',s.strip()):
            block=' '.join(block.split())
            if not block:continue
            m=re.match(r'^(\d+)\.\s*(.*)',block)
            result.append({'number':int(m[1]) if m else None,'text':m[2] if m else block,'page':page})
    return result


def import_book(pdf, destination):
    from PIL import Image
    destination.mkdir(parents=True,exist_ok=True)
    images=destination/'images';images.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='n5-course-import-') as temp:
        temp=Path(temp)
        subprocess.run(['pdftotext','-layout',str(pdf),str(temp/'book.txt')],check=True)
        subprocess.run(['pdftotext','-bbox-layout',str(pdf),str(temp/'book.xml')],check=True)
        pages=(temp/'book.txt').read_text().split('\f')
        boxes=ET.parse(temp/'book.xml').findall('.//{*}page')
        if len(boxes)!=164:raise ValueError('Expected the reviewed 164-page workbook')
        units=[{'id':str(n),'title':'Вводный урок · Кана' if n==0 else f'Урок {n}'} for n in range(26)]
        for n in range(5,26,5):units.append({'id':f'review-{n-4}-{n}','title':f'Повторение {n-4}–{n}'})
        items=[];assets={}
        def add(unit,kind,prompt,answer,source,**extra):
            index=sum(i['unit']==unit and i['kind']==kind for i in items)+1
            items.append({'id':f'{unit}-{kind}-{index}','unit':unit,'kind':kind,'prompt':prompt,'answer':answer,'source':source,**extra})
        for unit,a,b,c,d in RANGES:
            questions=text_parts(pages,a,b);answers=text_parts(pages,c,d)
            # Some visible PDF text is absent from its text layer.
            if unit=='3':
                questions[15:15]=[{'number':16,'text':'Вон тот словарь недешёвый.','page':20},{'number':17,'text':'Здесь нечисто.','page':20}]
            if unit=='7':questions.insert(16,{'number':17,'text':'Здесь нечисто.','page':35})
            expected=30 if unit.startswith('review') else 20
            if len(questions)!=expected or len(answers)!=expected:
                raise ValueError(f'Unpaired translations in {unit}: {len(questions)} / {len(answers)}')
            for n,(q,answer) in enumerate(zip(questions,answers),1):
                for part in [q,answer]:
                    if part['number'] is not None and part['number']!=n and not(unit=='9' and n==17 and part is q):
                        raise ValueError(f'Unexpected source numbering: {unit} / {n}')
                model=answer['text'];note=''
                if unit=='review-6-10' and n==12:model=model.replace('せんげつ','らいげつ');note='Исправлено «в прошлом месяце» → «в следующем месяце» в ключе.'
                if unit=='3' and n==18:model=model.replace('じゅうじさんじゅうななふん','じゅうじにじゅうななふん');note='В условии 10:27; исправлена минута в ключе.'
                if unit=='17' and n==4:model=model.replace('ティケット','チケット');note='Исправлено написание チケット в ключе.'
                if unit=='17' and n==10:model='私はうんてんをしますから、おさけをのみません。';note='Настоящее / будущее время согласовано с условием.'
                if unit=='23' and n==11:model=model.replace('くらくく','くらく');note='Исправлена лишняя く в ключе.'
                add(unit,'translation',q['text'],model,{'page':q['page'],'number':n,'answer_page':answer['page']},note=note)
        # Kana: transcribed explicitly because the answer page contains visual/text-layer errors.
        hira='omoshiroi|おもしろい;kawaii|かわいい;kenko:|けんこう;sho:gatsu|しょうがつ;do:butsu|どうぶつ;mochiron|もちろん;omocha|おもちゃ;zannen|ざんねん;gakko:|がっこう;musume|むすめ;su:gaku|すうがく;jugyo:|じゅぎょう;chotto|ちょっと;natto:|なっとう;chu:mon|ちゅうもん;yukkuri|ゆっくり;ju:do:|じゅうどう;yu:mei|ゆうめい;renshu:|れんしゅう;shuccho:|しゅっちょう'
        kata='inku|インク;eakon|エアコン;kokoa|ココア;konpyu:ta:|コンピューター;sensu|センス;depa:to|デパート;enerugi:|エネルギー;suka:to|スカート;karaoke|カラオケ;furansu|フランス;myu:jikaru|ミュージカル;dokyumento|ドキュメント;sandoicchi|サンドイッチ;roshia|ロシア;masuku|マスク;esukare:ta:|エスカレーター;orinpikku|オリンピック;basukettobo:ru|バスケットボール;rajio|ラジオ;mayone:zu|マヨネーズ'
        for label,content in [('хираганой',hira),('катаканой',kata)]:
            for row in content.split(';'):
                prompt,answer=row.split('|');add('0','kana',f'Запишите {label}: {prompt}',answer,{'page':7,'answer_page':109},answers=[answer],script='hiragana' if label=='хираганой' else 'katakana')
        negative='ちいさい|ちいさくない;やすい|やすくない;しずか|しずかじゃない;きれい|きれいじゃない;つまらない|つまらなくない;たいせつ|たいせつじゃない;きたない|きたなくない;ふべん|ふべんじゃない;まじめ|まじめじゃない;ひくい|ひくくない'
        for row in negative.split(';'):
            prompt,answer=row.split('|');accepted=[answer,answer+'です']
            if 'じゃない' in answer:
                stem=answer.removesuffix('じゃない');accepted +=[stem+ending for ending in ['ではない','ではないです','じゃありません','ではありません']]
            elif answer.endswith('くない'):
                accepted.append(answer.removesuffix('くない')+'くありません')
            add('3','form','Образуйте отрицание: '+prompt,answer,{'page':14,'answer_page':112},answers=accepted)
        numeric=pages[16].split('Запишите числительные хираганой:')[1].split('Ответы')[0]
        numbers=[int(n) for n in re.findall(r'(\d+)\s+[＿_]',numeric)]
        if len(numbers)!=30:raise ValueError('Missing number exercise')
        for n in numbers:
            answer=number_reading(n);accepted=[answer]
            if n%10==7:accepted.append(answer.removesuffix('なな')+'しち')
            if n%10==9:accepted.append(answer.removesuffix('きゅう')+'く')
            if n%10==4:accepted.append(answer.removesuffix('よん')+'し')
            add('3','number',f'Запишите хираганой: {n}',answer,{'page':17,'answer_page':112},answers=accepted)
        times=re.findall(r'(\d\d):(\d\d)',pages[18].split('Ответы')[0])
        if len(times)!=20:raise ValueError('Missing clock exercise')
        for h,m in times:
            answers=clock_readings(int(h),int(m));add('3','clock',f'Запишите время хираганой: {h}:{m}',answers[0],{'page':19,'answer_page':113},answers=answers)
        # Written-number questions are self-check: each source asks for kanji and digits together.
        for n in [432,309,3600,5241,145,639,1944,820,6666,7903,4884,3659]:
            add('8','written-number','Запишите число кандзи и цифрами: '+number_reading(n),f'{number_written(n)} · {n}',{'page':38,'answer_page':121})
        for h,m in re.findall(r'(\d\d):(\d\d)',pages[40].split('Ответы')[0]):
            answer=number_written(int(h))+'時'+(number_written(int(m))+'分' if int(m) else '')
            add('9','written-clock',f'Запишите время кандзи: {h}:{m}',answer,{'page':41,'answer_page':123})
        rendered={}
        def lines(page):
            return [(float(l.get('yMin')),float(l.get('yMax')),' '.join(w.text or '' for w in l.findall('{*}word'))) for l in boxes[page-1].findall('.//{*}line')]
        def crop(page,top,bottom,label):
            if page not in rendered:
                prefix=temp/f'page-{page}'
                subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-scale-to','1800','-png','-singlefile',str(pdf),str(prefix)],check=True,stderr=subprocess.DEVNULL)
                rendered[page]=Image.open(str(prefix)+'.png').convert('RGB')
            image=rendered[page];scale=image.height/float(boxes[page-1].get('height'))
            result=image.crop((int(45*scale),int(max(35,top)*scale),int(550*scale),int(min(785,bottom)*scale)))
            filename=f'{label}-{page}.png';path=images/filename;result.save(path,optimize=True)
            key=filename.removesuffix('.png');assets[key]={'filename':'images/'+filename,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
            return key
        for unit,qpages,answer_page,marker in WORKSHEETS:
            question_images=[]
            for i,page in enumerate(qpages):
                ls=lines(page)
                top=next(y-5 for y,_,t in ls if marker in t) if not i else 58
                stops=[y-7 for y,_,t in ls if y>top+10 and ('Выполните' in t or 'Ответы см.' in t)]
                bottom=min(stops,default=775)
                question_images.append(crop(page,top,bottom,f'q-{unit}'))
            ls=lines(answer_page)
            if unit=='4':top=next(y-5 for y,_,t in ls if 'Запишите порядок' in t)
            else:top=55
            bottom=min([y-7 for y,_,t in ls if y>top+10 and 'Выполните' in t],default=775)
            answer_images=[] if unit=='7' else [crop(answer_page,top,bottom,f'a-{unit}')]
            note=''
            model='Сравните каждую строку с образцом.'
            if unit=='7':
                # Replace the faulty reading of 八 in the source key with a reviewed textual key.
                answer_images=[];model='四 — シ・よん, четыре\n山 — サン・やま, гора\n三 — サン・みっつ, три\n川 — セン・かわ, река\n六 — ロク・むっつ, шесть\n土 — ド・ト・つち, земля\n金 — キン・かね, металл, деньги\n八 — ハチ・やっつ, восемь\n火 — カ・ひ, огонь\n日 — ニチ・ジツ・ひ・か, день, солнце'
                note='В ключе исправлено чтение 八: はち / やっつ, а не ひ.'
            title={'Запишите порядок':'Запишите порядок черт кандзи.',
                   'Запишите иероглифы':'Запишите кандзи по картинкам.',
                   'Напишите чтения':'Напишите чтения и значения кандзи.',
                   'Запишите пропущенные':'Запишите пропущенные кандзи.',
                   '漢字':'Запишите пропущенные кандзи.',
                   'Вставьте подходящие':'Вставьте подходящие глаголы в нужной форме. Используйте кандзи.'}[marker]
            add(unit,'worksheet',title,model,{'page':qpages[0],'answer_page':answer_page},images=question_images,answer_images=answer_images,note=note)
        # The source typo in the open-ended verb worksheet is shown with an explicit correction.
        next(i for i in items if i['unit']=='21' and i['kind']=='worksheet')['note']='В задании 10 читайте このケーキ вместо опечатки ことケーキ. Возможны и другие подходящие по смыслу глаголы.'
        document={'version':1,'title':'Практика по тетради N5','source':'Рабочая тетрадь N5','units':units,'items':items,'assets':assets}
        (destination/'workbook.json').write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n')
        return document

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf',type=Path)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'data/materials/course/n5')
    args=parser.parse_args()
    book=import_book(args.pdf.resolve(),args.output.resolve())
    print(f"Imported {len(book['items'])} exercise cards across {len(book['units'])} units; source PDF is no longer needed.")
