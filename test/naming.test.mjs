import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectSubdomain } from '../dist/naming.js';

test('project roles use the named app instead of repository suffixes', () => {
  for (const [name, slug] of [['Mi Proyecto', 'mi-proyecto'], ['Tienda Luna', 'tienda-luna'], ['Clínica Sol', 'clinica-sol']]) {
    assert.equal(projectSubdomain({ name }, 'landing'), slug);
    assert.equal(projectSubdomain({ name }, 'frontend'), `dashboard-${slug}`);
    assert.equal(projectSubdomain({ name }, 'backend'), `api-${slug}`);
  }
  for (const [role, expected] of [['landing', 'sheeplink'], ['frontend', 'dashboard-sheeplink'], ['backend', 'api-sheeplink']]) {
    assert.equal(projectSubdomain({ name: 'Sheeplink' }, role), expected);
  }
  assert.equal(projectSubdomain({ name: 'Clínica Sol' }, 'frontend'), 'dashboard-clinica-sol');
  assert.equal(projectSubdomain({ name: 'New display name', subdomain_base: 'sheeplink.nexode.app' }, 'backend'), 'api-sheeplink');
  assert.throws(() => projectSubdomain({ name: '🔥' }, 'landing'), /Choose a project name/);
});

test('default service names remain inside wildcard TLS coverage and one DNS label', () => {
 for (const role of ['landing','frontend','backend']) assert.ok(!projectSubdomain({name:'SHEEPLINK'},role).includes('.'));
 assert.equal(projectSubdomain({name:'a'.repeat(53)},'frontend').length,63);
 assert.throws(()=>projectSubdomain({name:'a'.repeat(54)},'frontend'),/63 characters/);
});
