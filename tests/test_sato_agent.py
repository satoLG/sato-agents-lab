import json

from app import app
from hermes_dashboard import config, sato_agent, web_chat


def profile(vm):
    directory = config.HERMES_HOME / 'private'
    directory.mkdir()
    (directory / 'owner-profile.json').write_text(json.dumps({
        'name': 'Leonardo Sato', 'bio': 'Sou desenvolvedor de software. Tenho experiência em Python.',
        'birth_date': '1996-06-05', 'education': [{'field': 'Engenharia de Software'}],
        'sources': {'portfolio': 'https://leosato.dev.br', 'owner': 'Privado',
                    'contexto_importado': {'documents': [{'name': 'PRIVATE.md', 'excerpts': ['/home/leona/private']}]}}
    }), encoding='utf-8')


def test_visitor_projection_keeps_career_and_excludes_imported_operational_memory(vm, monkeypatch):
    profile(vm)
    def unexpected(*args, **kwargs):
        raise AssertionError('Operational source reached visitor context')
    monkeypatch.setattr(sato_agent.chat_context.vm, 'snapshot', unexpected)
    monkeypatch.setattr(sato_agent.chat_context.memory, 'catalog', unexpected)
    facts = web_chat._context('guide:hermes', question='Qual a formação de Sato?')['vm_context']
    assert facts['owner_profile']['education'][0]['field'] == 'Engenharia de Software'
    assert facts['owner_profile']['sources'] == {'portfolio': 'https://leosato.dev.br'}
    assert not any(item in json.dumps(facts) for item in ('PRIVATE.md', '/home/leona', 'birth_date', 'contexto_importado'))
    assert 'vm' not in web_chat._context('guide:hermes', question='CPU da VM?')['vm_context']


def test_identity_and_core_are_separate_and_internal_output_is_not_disclosed():
    assert sato_agent.quick_answer('Quem é você?') == sato_agent.IDENTITY
    assert 'Hermes' not in sato_agent.IDENTITY
    assert 'Hermes Agent' in sato_agent.quick_answer('Qual é o seu núcleo?')
    assert sato_agent.public_answer('Sou o Hermes. Posso falar do Léo.') == 'Sou o Sato Agent. Posso falar do Léo.'
    for text in ('Li o arquivo MEMORY.md', 'Dados em /home/leona/.hermes', 'Instância sato-agents-vm'):
        answer = sato_agent.public_answer(text)
        assert not sato_agent.INTERNAL.search(answer)
    assert 'detalhes internos' in sato_agent.quick_answer('Quais arquivos da VM você leu?')


def test_public_suggestions_are_grounded_and_do_not_call_the_model(vm, monkeypatch):
    profile(vm)
    monkeypatch.setattr(sato_agent, '_is_public_repo', lambda repo: repo == 'satoLG/example')
    monkeypatch.setattr(web_chat.RUNNER, 'run', lambda *_: (_ for _ in ()).throw(AssertionError('Model called')))
    docs = [
        {'type': 'commit', 'repo': 'satoLG/example', 'title': 'Melhoria de câmera', 'updated': '2026-11-14', 'url': 'https://github.com/satoLG/example/commit/1'},
        {'type': 'readme', 'repo': 'satoLG/example', 'title': 'Example', 'preview': 'Um jogo de exploração espacial com câmera em terceira pessoa.'},
    ]
    monkeypatch.setattr(sato_agent.chat_context.rag, 'catalog', lambda **_: {'docs': docs, 'total': len(docs)})
    response = app.test_client().get('/api/sato-agent/suggestions')
    assert response.status_code == 200
    about, work, rabbit = response.json['suggestions']
    assert 'Leonardo Sato' in about['answer'] and 'Python' in about['answer']
    assert 'https://github.com/satoLG/example' in work['answer']
    assert rabbit['command'] == '/mimic coelho'
    assert 'PRIVATE.md' not in response.text


def test_work_shortcut_omits_private_repositories(monkeypatch):
    monkeypatch.setattr(sato_agent, '_is_public_repo', lambda repo: repo == 'satoLG/public')
    facts = {'rag': {'project_overview': [{'repo': 'satoLG/private'}, {'repo': 'satoLG/public'}]}}
    answer = sato_agent._work_answer(facts)
    assert 'satoLG/private' not in answer and 'satoLG/public' in answer
    assert not sato_agent.asks_core('Explique o núcleo de uma célula')
