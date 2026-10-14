import re

import app as app_module


def test_lab_versions_entrypoint_and_relative_dependencies(client):
    html = client.get('/lab').get_data(as_text=True)
    entry = re.search(r'<script type="module" src="([^"]+)"', html).group(1)
    prefix = f'/lab-assets/{app_module.LAB_ASSET_VERSION}/'
    assert entry == prefix + 'js/lab.js'
    assert prefix + 'css/lab.css' in html
    for filename in ['js/lab.js', 'js/lab-scene.js', 'js/lab-avatar.js',
                     'vendor/three.module.min.js', 'vendor/GLTFLoader.js',
                     'models/sato.glb', 'css/lab.css', 'js/lab-layout.js',
                     'js/lab-signage.js', 'icons/lucide/cpu.svg', 'audio/portal2/click.wav']:
        response = client.get(prefix + filename)
        original = client.get('/static/' + filename)
        assert response.status_code == 200
        assert response.data == original.data
        assert response.mimetype == original.mimetype
        assert 'no-store' in response.headers['Cache-Control']


def test_lab_asset_version_cannot_silently_serve_another_release(client):
    assert client.get('/lab-assets/old-release/js/lab.js').status_code == 404
    prefix = f'/lab-assets/{app_module.LAB_ASSET_VERSION}/'
    assert client.get(prefix + 'missing.js').status_code == 404
    assert client.get(prefix + '../app.py').status_code == 404


def test_orb_rock_maps_are_local_and_lightweight(client):
    prefix = f'/lab-assets/{app_module.LAB_ASSET_VERSION}/textures/orb-moon/'
    total = 0
    for name in ['rock-color.webp', 'rock-normal.webp', 'rock-height.png']:
        response = client.get(prefix + name)
        assert response.status_code == 200
        if name.endswith('.webp'):
            assert response.mimetype == 'image/webp'
            assert response.data[:4] == b'RIFF' and response.data[8:12] == b'WEBP'
        else:
            assert response.mimetype == 'image/png'
            assert response.data[:8] == b'\x89PNG\r\n\x1a\n'
        total += len(response.data)
    assert total < 120_000
