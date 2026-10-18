import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectSubdomain } from '../dist/naming.js';

test('project roles use the named app instead of repository suffixes', () => {
  for (const [role, expected] of [['landing', 'sheeplink'], ['frontend', 'panel.sheeplink'], ['backend', 'api.sheeplink']]) {
    assert.equal(projectSubdomain({ name: 'Sheeplink' }, role), expected);
  }
  assert.equal(projectSubdomain({ name: 'Clínica Sol' }, 'frontend'), 'panel.clinica-sol');
  assert.equal(projectSubdomain({ name: 'New display name', subdomain_base: 'sheeplink.nexode.app' }, 'backend'), 'api.sheeplink');
  assert.throws(() => projectSubdomain({ name: '🔥' }, 'landing'), /Choose a project name/);
});
