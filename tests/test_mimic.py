import copy
import json

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
    plan = copy.deepcopy(mimic.PRESETS['rabbit'])
    plan.update(id='dragon', label='um dragão')
    calls = []
    def generate(prompt):
        calls.append(prompt)
        return 'invalid' if len(calls) == 1 else json.dumps({'possible': True, 'performance': plan})
    result = mimic.plan('um dragão', generate)
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
    performance = copy.deepcopy(mimic.PRESETS['rabbit'])
    performance['frames'][1]['calls'] = [{'name': 'arm_pose', 'arguments': {'side': 'left', 'width': 1.4}}]
    assert mimic.valid_plan(performance)
    invalid = copy.deepcopy(performance)
    invalid['frames'][1]['calls'][0]['arguments']['width'] = 9
    calls = []
    def generate(prompt):
        calls.append(prompt)
        return json.dumps({'possible': True, 'performance': invalid if len(calls) == 1 else performance})
    assert mimic.plan('um passarinho', generate)['plan'] == performance
    assert 'performance.frames[1].calls[0].arguments.width' in calls[1]
    assert 'PREVIOUS JSON' in calls[1]
