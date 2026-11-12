// Generate public HTML from the existing editorial data. No dependencies required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const context = vm.createContext({ window: {} });
for (const file of ['roles-data.js', 'posts.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', file), 'utf8'), context);
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const posts = context.window.sitePosts.filter(p => p.lang === 'de').sort((a,b) => b.date.localeCompare(a.date));
const roles = context.window.siteRoles;
const date = value => new Intl.DateTimeFormat('de-DE', {day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value));
function postCard(post, index, featured) {
  const title = escape(post.title), url = escape(post.url), linkTitle = escape(`${post.title} lesen`);
  const alt = escape(post.imageAlt || `Vorschaubild zum Beitrag ${post.title}`);
  const sizes = featured ? '(max-width: 920px) calc(100vw - 2rem), (max-width: 1152px) calc((100vw - 4rem) / 3), 363px' : '(max-width: 1152px) calc(100vw - 2rem), 1120px';
  const image = post.image ? `<a class="post-card__image" href="${url}" title="${linkTitle}" aria-hidden="true" tabindex="-1"><img src="${escape(post.image)}"${post.imageSrcset ? ` srcset="${escape(post.imageSrcset)}" sizes="${sizes}"` : ''}${post.imageWidth && post.imageHeight ? ` width="${post.imageWidth}" height="${post.imageHeight}"` : ''} loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" alt="${alt}" title="${alt}"></a>` : '';
  return `<article class="post-card" data-post-tags="${escape(JSON.stringify(post.tags))}">
${image}
<div class="post-card__meta">${date(post.date)}<span class="post-card__tags">${post.tags.map(t => `<span class="tag">${escape(t)}</span>`).join('')}</span></div>
<h2><a href="${url}" title="${linkTitle}">${title}</a></h2>
<p>${escape(post.excerpt)}</p>
</article>`;
}
function roleCard(role, index) {
  return `<article class="role-card" aria-label="${index+1} / ${roles.length}"><div class="role-card__columns">${['de','en'].map(lang => {
    const c = role[lang];
    const url = role.url ? new URL(role.url, 'https://michael-buettner.eu/') : null;
    const href = url && (url.hostname === 'michael-buettner.eu' ? url.pathname + url.search + url.hash : url.href);
    return `<div class="role-card__language" lang="${lang}" data-language="${lang}">
<h3 class="role-card__title">${escape(c.title)}</h3>
<h4 class="role-card__label">${lang === 'de' ? 'Verantwortung' : 'Responsibility'}</h4>
<p class="role-card__responsibility">${escape(c.responsibility)}</p>
<h4 class="role-card__label">${lang === 'de' ? 'Tätigkeiten' : 'Activities'}</h4>
<ul class="role-card__activities">${c.activities.map(a => `<li>${escape(a)}</li>`).join('')}</ul>
<div class="role-card__success"><h4 class="role-card__label">${lang === 'de' ? (c.success.includes(';') ? 'Erfolge' : 'Erfolg') : 'Results'}</h4><p>${escape(c.success)}</p></div>
${href ? `<a class="button button--secondary" href="${escape(href)}">${escape(c.articleTitle)}</a>` : ''}
</div>`;
  }).join('\n')}</div></article>`;
}
for (const file of ['index.html','blog.html','arbeitsproben.html']) {
  const target = path.join(root,file);
  const original = fs.readFileSync(target,'utf8');
  let html = original;
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const blocks = {posts: posts.slice(0, file === 'blog.html' ? posts.length : 3).map((p,i)=>postCard(p,i,file !== 'blog.html')).join('\n')};
  if (file === 'index.html') blocks.roles = `<div class="roles__viewport" id="role-cards">\n${roles.map(roleCard).join('\n')}\n</div>`;
  for (const [name,content] of Object.entries(blocks)) {
    const pattern = new RegExp(`<!-- generated:${name}:start -->[\\s\\S]*?<!-- generated:${name}:end -->`);
    if (!pattern.test(html)) throw new Error(`Missing ${name} markers in ${file}`);
    html = html.replace(pattern, () => `<!-- generated:${name}:start -->${newline}${content.replace(/\n/g, newline)}${newline}<!-- generated:${name}:end -->`);
  }
  if (html !== original) {
    if (check) { console.error(`${file}: generated cards are outdated. Run node scripts/build-static-cards.cjs`); process.exitCode=1; }
    else { fs.writeFileSync(target,html); console.log(`Updated ${file}`); }
  }
}
