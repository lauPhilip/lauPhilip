// Rebuilds the generated parts of README.md from the portfolio's data files.
// Only the text between <!-- NAME:START --> and <!-- NAME:END --> markers is replaced;
// everything else in README.md is written by hand and left alone.
//
// Usage:  node scripts/build-readme.mjs
// Env:    SITE_URL   where to read the data from (default https://lauphilip.github.io)
//         PUBLIC_URL base for links in the README (defaults to SITE_URL)

import { readFile, writeFile } from 'node:fs/promises';

const SITE = (process.env.SITE_URL || 'https://lauphilip.github.io').replace(/\/$/, '');
const PUBLIC = (process.env.PUBLIC_URL || (/^https?:/.test(SITE) ? SITE : 'https://lauphilip.github.io')).replace(/\/$/, '');
const README = new URL('../README.md', import.meta.url);

async function get(path) {
  // SITE_URL may also be a local folder, which makes testing easy.
  if (!/^https?:/.test(SITE)) return JSON.parse(await readFile(`${SITE}/${path}`, 'utf8'));
  const res = await fetch(`${SITE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function shorten(text, max = 80) {
  let t = String(text).split(/(?<=[.!?])\s/)[0].split(/ — |: /)[0].trim().replace(/[.]$/, '');
  if (t.length > max) t = `${t.slice(0, t.lastIndexOf(' ', max - 1))}…`;
  return t;
}

function nowSection(site) {
  return (site.now || [])
    .map((n) => `- **${n.kicker}:** ${n.title}. ${n.text}`)
    .join('\n');
}

function skillsSection(site) {
  const skills = site.quick?.top_skills || [];
  return skills.length ? `**Mostly working with:** ${skills.join(' · ')}` : '';
}

function workSection(projects) {
  const rows = projects.map(({ entry, info }) => {
    const name = entry.short || info.title.split(':')[0];
    const what = entry.tagline || shorten(info.short_desc);
    const stack = (info.tags || []).filter((t) => !/nda|open-source/i.test(t)).slice(0, 3).join(', ');
    const repo = (info.links || []).find((l) => /github\.com/.test(l.url));
    let code = '—';
    if (info.private) code = 'private';
    else if ((info.tags || []).some((t) => /nda/i.test(t))) code = 'under NDA';
    else if (repo) code = `[repo](${repo.url})`;
    return `| [${cell(name)}](${PUBLIC}/#project/${entry.id}) | ${cell(what)} | ${cell(stack)} | ${code} |`;
  });
  return ['| Project | What it is | Built with | Code |', '|---|---|---|---|', ...rows].join('\n');
}

function replaceBlock(md, name, content) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(md)) throw new Error(`Marker ${name} not found in README.md`);
  return md.replace(re, `$1\n${content}\n$2`);
}

const [site, registry] = await Promise.all([get('data/site.json'), get('data/projects.json')]);
const featured = registry.filter((p) => p.featured);
const projects = (await Promise.all(featured.map(async (entry) => {
  try { return { entry, info: await get(`projects/${entry.id}/info.json`) }; }
  catch (e) { console.warn(`Skipping ${entry.id}: ${e.message}`); return null; }
}))).filter(Boolean);

let md = await readFile(README, 'utf8');
const before = md;
md = replaceBlock(md, 'NOW', nowSection(site));
md = replaceBlock(md, 'WORK', workSection(projects));
md = replaceBlock(md, 'SKILLS', skillsSection(site));

if (md === before) console.log('README.md is already up to date.');
else { await writeFile(README, md); console.log('README.md updated.'); }
