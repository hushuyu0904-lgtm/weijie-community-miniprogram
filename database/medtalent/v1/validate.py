"""Offline schema/semantic checks. Not an installed CloudBase request handler.

Usage: python -m pip install -r requirements-dev.txt && python validate.py
No network, database, or user data access during validation.
"""
import copy
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).parent
def read(name): return json.loads((ROOT/name).read_text(encoding='utf-8'))
COLLECTION_SCHEMA = read('collections.schema.json')
REQUEST_SCHEMA = read('requests.schema.json')
CV = Draft202012Validator(COLLECTION_SCHEMA, format_checker=FormatChecker())
RV = Draft202012Validator(REQUEST_SCHEMA, format_checker=FormatChecker())
EXCHANGE_SCHEMA = read('exchange.schema.json')
EV = Draft202012Validator(EXCHANGE_SCHEMA, format_checker=FormatChecker())

def require(condition, message):
    if not condition: raise ValueError(message)

def unique(items, key, label):
    require(len({i[key] for i in items}) == len(items), label+' duplicate '+key)

def validate_catalog(catalog, questionnaire):
    CV.validate({'collection':'talent_catalogs','document':catalog})
    CV.validate({'collection':'talent_questionnaires','document':questionnaire})
    require(questionnaire['catalogId'] == catalog['_id'], 'catalog mismatch')
    for items,key,label in [(catalog['concepts'],'id','concept'),(catalog['fields'],'id','field'),(questionnaire['questions'],'id','question'),(questionnaire['repeatGroups'],'id','group')]:
        unique(items,key,label)
    concepts={i['id']:i for i in catalog['concepts']}
    fields={i['id']:i for i in catalog['fields']}
    groups={i['id']:i for i in questionnaire['repeatGroups']}
    questions={i['id']:i for i in questionnaire['questions']}
    for f in fields.values():
        require(set(f['allowedConceptIds']) <= set(concepts), 'unknown field concept')
        require(f['groupId'] is None or f['groupId'] in groups, 'unknown field group')
    seen=set()
    for q in questions.values():
        require(q['fieldId'] in fields, 'unknown field')
        f=fields[q['fieldId']]
        require(q['groupId']==f['groupId'], 'question group mismatch')
        require((q['control']=='single')==(f['cardinality']=='single'), 'cardinality mismatch')
        require(q['maxSelections']==1 if q['control']=='single' else True, 'single maximum')
        unique(q['options'],'id','option')
        for option in q['options']:
            require(set(option['valueCodes'])<=set(f['allowedConceptIds']), 'unknown option concept')
            require(not(q['control']=='single' and len(option['valueCodes'])!=1), 'single code count')
        cond=q['showWhen']
        if cond:
            require(cond['questionId'] in seen, 'branch must reference an earlier question')
            parent=questions[cond['questionId']]
            require(parent['groupId']==q['groupId'], 'cross-group branch unsupported in v1')
            require(set(cond['optionIdsAny'])<={o['id'] for o in parent['options']}, 'unknown branch option')
        seen.add(q['id'])
    for group in groups.values():
        require(group['minInstances']<=group['maxInstances'], 'group instance range')
    for rule in questionnaire['skillRules']:
        require(rule['questionId'] in questions, 'rule question missing')
        require(rule['optionId'] in {o['id'] for o in questions[rule['questionId']]['options']}, 'rule option missing')
        require(rule['conceptId'] in concepts and concepts[rule['conceptId']]['kind']=='skill', 'rule must target skill')
        require(rule['levelCode'] in concepts and concepts[rule['levelCode']]['kind']=='level','rule level missing')

def validate_submission(request, catalog, questionnaire, require_published=True):
    RV.validate(request)
    require(request['action']=='submitTalentProfile','not a submission')
    validate_catalog(catalog,questionnaire)
    if require_published:
        require(catalog['status']=='published' and questionnaire['status']=='published','unpublished questionnaire/catalog')
    require((request['questionnaireId'],request['questionnaireVersion'],request['catalogId']) == (questionnaire['questionnaireId'],questionnaire['version'],catalog['_id']),'version mismatch')
    require(request['consents']['noticeVersion']==questionnaire['noticeVersion'],'notice mismatch')
    groups={g['id']:g for g in questionnaire['repeatGroups']}
    instances=request['instances']; unique(instances,'instanceId','repeat instance')
    for instance in instances: require(instance['groupId'] in groups,'unknown group')
    for group in groups.values():
        count=sum(i['groupId']==group['id'] for i in instances)
        require(group['minInstances']<=count<=group['maxInstances'],'repeat count')
    keys=[(a['questionId'],a['instanceId']) for a in request['answers']]
    require(len(set(keys))==len(keys),'duplicate answer')
    answers=dict(zip(keys,request['answers']))
    expected=set()
    for q in questionnaire['questions']:
        iids=[None] if q['groupId'] is None else [i['instanceId'] for i in instances if i['groupId']==q['groupId']]
        for iid in iids:
            key=(q['id'],iid); expected.add(key)
            require(key in answers,'missing answer status')
            a=answers[key]; cond=q['showWhen']; visible=True
            if cond:
                parent=answers[(cond['questionId'],iid)]
                visible=parent['status']=='provided' and bool(set(parent['optionIds']) & set(cond['optionIdsAny']))
            if not visible:
                require(a['status']=='not_asked' and not a['optionIds'],'hidden answer')
                continue
            if a['status']!='provided':
                require(a['status'] in q['allowMissingStatuses'],'unsupported missing status')
                require(not(q['required'] and a['status']=='skipped'),'required skipped')
                continue
            options={o['id']:o for o in q['options']}
            require(set(a['optionIds'])<=set(options),'unknown option')
            require(len(a['optionIds'])<=q['maxSelections'],'too many selections')
            require(not(len(a['optionIds'])>1 and any(options[i]['exclusive'] for i in a['optionIds'])),'exclusive option combined')
    require(set(answers)==expected,'unknown question or instance')

def validate_exchange(event):
    EV.validate(event)
    if event['eventType']=='profile_upsert':
        p=event['profile']
        require(p['personId']==event['personId'] and p['_id']==p['personId'],'exchange person mismatch')
        require(p['profileVersion']==event['aggregateVersion'],'exchange version mismatch')
        require(p['state']=='active','restricted profile cannot be exported')

def main():
    for schema in [COLLECTION_SCHEMA,REQUEST_SCHEMA,EXCHANGE_SCHEMA]: Draft202012Validator.check_schema(schema)
    catalog=read('catalog.seed.json'); questionnaire=read('questionnaire.seed.json'); request=read('submit.example.json')
    validate_catalog(catalog,questionnaire)
    validate_submission(request,catalog,questionnaire,require_published=False)
    profile=read('profile.example.json')
    CV.validate({'collection':'talent_profiles','document':profile})
    exchange=read('exchange.example.json'); validate_exchange(exchange)
    # Negative cases target data-loss, forged authority, bad dictionaries and branching.
    cases=[]
    def bad(label, mutate):
        r=copy.deepcopy(request); mutate(r); cases.append((label,lambda r=r:validate_submission(r,catalog,questionnaire,False)))
    bad('forged personId',lambda r:r.update(personId='another_person'))
    bad('forged role',lambda r:r.update(role='admin'))
    bad('invalid option',lambda r:r['answers'][0].update(optionIds=['invented']))
    bad('duplicate answer',lambda r:r['answers'].append(copy.deepcopy(r['answers'][0])))
    bad('single answer multiple choices',lambda r:r['answers'][0].update(optionIds=['q_stage_1','q_stage_2']))
    bad('missing status with a value',lambda r:r['answers'][0].update(status='unknown'))
    bad('empty provided answer',lambda r:r['answers'][0].update(optionIds=[]))
    bad('wrong notice',lambda r:r['consents'].update(noticeVersion='9.0.0'))
    bad('wrong questionnaire version',lambda r:r.update(questionnaireVersion='9.0.0'))
    bad('required skipped',lambda r:r['answers'][0].update(status='skipped',optionIds=[]))
    bad('hidden followup submitted',lambda r:r['answers'][7].update(optionIds=['q_sql_1']))
    bad('exclusive none plus experience',lambda r:r['answers'][6].update(optionIds=['q_experience_1','q_experience_7']))
    bad('free text answer',lambda r:r['answers'][0].update(text='uncontrolled'))
    bad('unregistered repeat instance',lambda r:r['instances'].append({'groupId':'education','instanceId':'edu_1'}))
    cases.append(('draft rejected by production gate',lambda:validate_submission(request,catalog,questionnaire,True)))
    for label, mutate in [
        ('exchange identity mismatch',lambda e:e.update(personId='other_person')),
        ('exchange version mismatch',lambda e:e.update(aggregateVersion=2)),
        ('withdrawn analysis export',lambda e:e['consentState'].update(personalAnalysis=False)),
        ('delete event carries profile',lambda e:e.update(eventType='person_deleted')),
        ('leaked memberKey',lambda e:e.update(memberKey='0'*64))]:
        e=copy.deepcopy(exchange); mutate(e)
        cases.append((label,lambda e=e:validate_exchange(e)))
    for label,call in cases:
        try: call()
        except (ValueError, __import__('jsonschema').ValidationError): pass
        else: raise AssertionError('Expected rejection: '+label)
    # Valid unanswered branch; unknown is not level zero.
    r=copy.deepcopy(request); r['answers'][7].update(status='unknown',optionIds=[]); r['answers'][8].update(status='not_asked',optionIds=[])
    validate_submission(r,catalog,questionnaire,False)
    # The schema deliberately includes conditional and repeated episodes.
    c=copy.deepcopy(catalog); q=copy.deepcopy(questionnaire); r=copy.deepcopy(request)
    q['repeatGroups']=[{'id':'education','label':'教育经历','minInstances':1,'maxInstances':3}]
    f=copy.deepcopy(c['fields'][1]); f.update(id='education_degree',groupId='education'); c['fields'].append(f)
    repeat=copy.deepcopy(q['questions'][1]); repeat.update(id='q_education_degree',fieldId='education_degree',groupId='education'); q['questions'].append(repeat)
    r['instances']=[{'groupId':'education','instanceId':'edu_1'},{'groupId':'education','instanceId':'edu_2'}]
    r['answers'] += [{'questionId':'q_education_degree','instanceId':i,'status':'provided','optionIds':['q_degree_2']} for i in ['edu_1','edu_2']]
    validate_submission(r,c,q,False)
    e=copy.deepcopy(exchange); e.update(eventType='person_deleted',profile=None,aggregateVersion=2); e['consentState'].update(personalAnalysis=False,opportunityNotifications=False)
    validate_exchange(e)
    print(f'PASS: 3 schema meta-validations; catalog + questionnaire + request + profile + exchange fixtures; {len(cases)} invalid cases; missing branch, repeated education and deletion cases.')
    print('Not tested: CloudBase deployment, authentication, transactions, real data, PostgreSQL importer, or matching quality.')

if __name__=='__main__': main()
