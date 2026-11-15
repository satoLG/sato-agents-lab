import copy
import json
import pytest

from app import app
from hermes_dashboard import mimic


def test_tool_catalog_matches_the_browser_contract_and_contains_only_robot_tools():
    response = app.test_client().get('/api/sato-agent/mimic/tools')
    assert response.status_code == 200
    assert {tool['name'] for tool in response.json['tools']} == {'visor_draw', 'arm_pose', 'body_pose'}
    assert all(tool['inputSchema']['type'] == 'object' for tool in response.json['tools'])
    assert response.json == mimic.CAPABILITIES
    assert mimic.valid_plan(mimic.PRESETS['rabbit'])


def test_intent_parity_for_commands_polite_requests_and_regular_chat():
    for prompt in ('Imite um coelho', '/mimic coelho', 'Sato, você consegue imitar um coelho?', 'Pode imitar um coelho pra mim?'):
        assert mimic.intent(prompt) == 'coelho'
    assert mimic.intent('/mimic') == ''
    assert mimic.intent('/mimic 😡') == '😡'
    assert mimic.intent('Quem é Sato?') is None


def test_contract_rejects_unknown_tools_out_of_bounds_and_invalid_timeline():
    for mutate in (
        lambda p: p['frames'][0]['calls'][0].update(name='execute_code'),
        lambda p: p.update(duration=float('inf')),
        lambda p: p.update(version=True),
        lambda p: p['frames'][0].update(at=.1),
        lambda p: p['frames'][1].update(at=0),
        lambda p: p['frames'][0]['calls'][1]['arguments'].update(position=[0, 0, 0]),
        lambda p: p['drawings'][0][0].update(center=[12, 25]),
        lambda p: p['frames'][0]['calls'][0]['arguments'].update(drawing=3),
        lambda p: p.update(code='arbitrary'),
    ):
        plan = copy.deepcopy(mimic.PRESETS['rabbit'])
        mutate(plan)
        assert not mimic.valid_plan(plan)


def test_novel_plan_uses_the_catalog_without_private_context_and_repairs_once():
    response = {'possible': True, 'base': 'bird', 'label': 'uma coruja', 'changes': []}
    plan = mimic.derive(response)
    calls = []
    def generate(prompt):
        calls.append(prompt)
        return 'invalid' if len(calls) == 1 else json.dumps(response)
    result = mimic.plan('coruja', generate)
    assert result['plan'] == plan and len(calls) == 2
    assert 'arm_pose' in calls[0] and 'visor_draw' in calls[0]
    assert 'REQUEST JSON' in calls[0]
    assert 'violated the schema' in calls[1]
    assert not any(private in calls[0] for private in ('owner-profile', '/home/leona', 'USER.md'))


def test_refusal_and_malformed_response_do_not_create_an_action():
    result = mimic.plan('um cheiro real', lambda _: json.dumps({'possible': False, 'reason': 'Não consigo reproduzir cheiros.'}))
    assert result['plan'] is None and 'cheiros' in result['answer']
    calls = []
    result = mimic.plan('algo', lambda prompt: calls.append(prompt) or '{}')
    assert result['plan'] is None and len(calls) == 2


def test_partial_calls_are_valid_and_repair_gets_the_precise_field_error():
    response = {'possible': True, 'base': 'bird', 'label': 'um passarinho bravo',
                'changes': [{'frame': 1, 'calls': [{'name': 'arm_pose', 'arguments': {'side': 'left', 'width': 1.4}}]}]}
    performance = mimic.derive(response)
    assert mimic.valid_plan(performance)
    invalid = copy.deepcopy(response)
    invalid['changes'][0]['calls'][0]['arguments']['width'] = 9
    calls = []
    def generate(prompt):
        calls.append(prompt)
        return json.dumps(invalid if len(calls) == 1 else response)
    assert mimic.plan('passarinho bravo', generate)['plan'] == performance
    assert 'changes[0].calls[0].arguments.width' in calls[1]
    assert 'PREVIOUS JSON' in calls[1]


def test_curated_library_covers_each_category_and_every_alias_is_an_exact_shortcut():
    assert len(mimic.PRESETS) == 16 and mimic.LIBRARY.keys() == mimic.PRESETS.keys()
    assert {entry['category'] for entry in mimic.LIBRARY.values()} == {'animals', 'vehicles', 'objects', 'nature'}
    aliases = []
    for key, entry in mimic.LIBRARY.items():
        assert mimic.valid_plan(mimic.PRESETS[key]), key
        for alias in entry['aliases']:
            aliases.append(mimic.normalize(alias))
            assert mimic.plan(alias, lambda _: pytest.fail('A known preset called the model'))['plan'] == mimic.PRESETS[key]
    assert len(aliases) == len(set(aliases))
    assert mimic.preset_for('pássaro bravo') is None
    assert mimic.preset_for('árvore')['id'] == 'tree'


def test_every_planning_request_contains_the_application_library_without_mutating_it():
    prompt = mimic.planner_prompt('um carro de corrida')
    context = json.loads(prompt.split('LIBRARY JSON:\n')[1].split('\nDERIVATION EXAMPLE JSON:')[0])
    assert context.keys() == mimic.PRESETS.keys()
    assert all(item['performance'] == mimic.PRESETS[key] for key, item in context.items())
    snapshot = copy.deepcopy(mimic.PRESETS)
    response = {'possible': True, 'base': 'car', 'label': 'um carro de corrida', 'cycles': 3,
                'changes': [{'frame': 1, 'calls': [{'name': 'arm_pose', 'arguments': {'side': 'left', 'width': 1.45}}]}]}
    result = mimic.plan('carro de corrida', lambda _: json.dumps(response))['plan']
    assert result['id'] == 'car-variation' and result['label'] == 'um carro de corrida'
    assert result['frames'][1]['calls'][0]['arguments']['width'] == 1.45
    assert result['frames'][1]['calls'][0]['arguments']['position'] == snapshot['car']['frames'][1]['calls'][0]['arguments']['position']
    assert result['drawings'] == snapshot['car']['drawings']
    assert mimic.PRESETS == snapshot
    assert not any(private in prompt for private in ('owner-profile', 'USER.md', '/home/leona'))


@pytest.mark.parametrize('bad', [
    {'base': 'missing'}, {'base': []}, {'changes': [{'frame': 99, 'calls': []}]},
    {'changes': [{'frame': 0, 'calls': [{'name': 'execute_code', 'arguments': {}}]}]},
    {'changes': [{'frame': 1, 'calls': [{'name': 'arm_pose', 'arguments': {'side': 'left', 'length': 99}}]}]},
    {'drawings': []}, {'duration': 999}, {'frames': []}, {'changes': [{'frame': True, 'calls': []}]},
    {'performance': {}},
])
def test_invalid_derivations_fail_closed_and_get_one_correction_attempt(bad):
    calls = []
    response = {'possible': True, 'base': 'car', 'label': 'um carro de corrida', **bad}
    result = mimic.plan('carro de corrida', lambda prompt: calls.append(prompt) or json.dumps(response))
    assert result['plan'] is None and len(calls) == 2
    assert 'violated the schema' in calls[1]
