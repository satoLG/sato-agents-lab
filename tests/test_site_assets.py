import re

import app as app_module


def test_home_versions_entrypoint_and_relative_dependencies(client):
    html = client.get('/').get_data(as_text=True)
    entry = re.search(r'<script type="module" src="([^"]+)"', html).group(1)
    prefix = f'/assets/{app_module.ASSET_VERSION}/'
    assert entry == prefix + 'js/home.js'
    for filename in ('js/home.js', 'js/home-scene.js', 'js/lab-rigs.js',
                     'vendor/three.module.min.js', 'css/home.css', 'icons/lucide.svg'):
        response = client.get(prefix + filename)
        original = client.get('/static/' + filename)
        assert response.status_code == 200
        assert response.data == original.data
        assert response.mimetype == original.mimetype
        assert 'no-store' in response.headers['Cache-Control']


def test_assets_reject_wrong_versions_paths_and_removed_page_resources(client):
    assert client.get('/assets/old-release/js/home.js').status_code == 404
    prefix = f'/assets/{app_module.ASSET_VERSION}/'
    for filename in ('missing.js', '../app.py', 'js/lab.js', 'js/orb.js', 'js/model-inspector.js'):
        assert client.get(prefix + filename).status_code == 404
