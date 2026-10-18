export function projectSubdomain(app: { name?: string; subdomain_base?: string }, role: 'landing' | 'frontend' | 'backend') {
  const base = app.subdomain_base
    ? app.subdomain_base.replace(/\.(?:nexode\.app|localhost)$/, '')
    : (app.name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(base)) {
    throw new Error('Choose a project name that can form a DNS label or pass an explicit subdomain.');
  }
  return `${role === 'landing' ? '' : role === 'frontend' ? 'panel.' : 'api.'}${base}`;
}
