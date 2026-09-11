#!/usr/bin/env node

/**
 * Build/query/fetch a metadata index for Minecraft texture resources.
 *
 * The index is metadata-only. It never embeds Mojang/Microsoft image bytes in
 * the Skill. Remote mode inventories Mojang's Bedrock Samples tree; local mode
 * accepts an extracted Java client asset root or a Bedrock pack checkout. The
 * fetch command retrieves only explicitly selected files to a user-provided
 * temporary directory and writes a provenance manifest beside them.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO = 'Mojang/bedrock-samples';
const API_ROOT = `https://api.github.com/repos/${REPO}/git/trees`;
const SOURCE_ROOT = `https://github.com/${REPO}`;
const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}`;

function arg(name, fallback = undefined) {
  const prefix = `--${name}`;
  const inline = process.argv.find((value) => value.startsWith(`${prefix}=`));
  if (inline) return inline.slice(prefix.length + 1);
  const index = process.argv.indexOf(prefix);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) return process.argv[index + 1];
  return fallback;
}

function command() {
  return process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'help';
}

function printHelp() {
  console.log(`Minecraft texture corpus helper

Commands:
  index [--ref main] [--out FILE]
  index --root PATH [--out FILE]
  query --index FILE [--category blocks|entity|...] [--role image] [--match TEXT] [--limit N]
  fetch --index FILE --out DIR (--match TEXT | --path PATH | --category CATEGORY) [--limit N] [--force] [--include-metadata]

Remote index: Mojang/bedrock-samples/resource_pack/textures (metadata only).
Local index: an extracted Java client asset root, assets/minecraft/textures,
an entire Bedrock checkout, or a direct textures directory.
`);
}

function normalize(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

function flag(name, fallback = false) {
  const prefix = `--${name}`;
  const inline = process.argv.find((value) => value.startsWith(`${prefix}=`));
  if (inline) return !['false', '0', 'no', 'off'].includes(inline.slice(prefix.length + 1).toLowerCase());
  const index = process.argv.indexOf(prefix);
  if (index < 0) return fallback;
  const next = process.argv[index + 1];
  if (!next || next.startsWith('--')) return true;
  return !['false', '0', 'no', 'off'].includes(next.toLowerCase());
}

function extensionOf(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.texture_set.json')) return '.texture_set.json';
  if (lower.endsWith('.mcmeta')) return '.mcmeta';
  return path.posix.extname(lower);
}

function roleOf(filePath) {
  const ext = extensionOf(filePath);
  if (['.png', '.tga', '.jpg', '.jpeg'].includes(ext)) return 'image';
  if (ext === '.texture_set.json') return 'texture_set';
  if (ext === '.mcmeta') return 'animation_metadata';
  if (ext === '.json') {
    const name = path.posix.basename(filePath).toLowerCase();
    if (name === 'terrain_texture.json' || name === 'item_texture.json') return 'texture_catalog';
    if (name === 'blocks.json') return 'block_catalog';
    return 'resource_metadata';
  }
  return 'other';
}

function categoryOf(filePath) {
  const normalized = normalize(filePath).toLowerCase();
  const marker = normalized.indexOf('/textures/');
  const relative = marker >= 0 ? normalized.slice(marker + '/textures/'.length) : normalized.replace(/^textures\//, '');
  const first = relative.split('/')[0] || 'root';
  const known = new Set([
    'block', 'blocks', 'item', 'items', 'entity', 'entities', 'particle', 'particles',
    'ui', 'environment', 'colormap', 'map', 'painting', 'misc', 'models', 'font',
    'gui', 'trims', 'attachables', 'resource', 'terrain',
  ]);
  if (known.has(first)) return first;
  return first === 'root' ? 'root' : 'other';
}

function isImage(entry) {
  return entry.role === 'image';
}

function remoteUrls(ref, filePath) {
  const normalized = normalize(filePath);
  return {
    reference_url: `${SOURCE_ROOT}/blob/${encodeURIComponent(ref).replaceAll('%2F', '/')}/${normalized}`,
    raw_url: `${RAW_ROOT}/${encodeURIComponent(ref).replaceAll('%2F', '/')}/${normalized}`,
  };
}

function makeEntry(raw, sourcePath, source) {
  const normalized = normalize(sourcePath);
  const entry = {
    path: normalized,
    file_name: path.posix.basename(normalized),
    extension: extensionOf(normalized),
    role: roleOf(normalized),
    category: categoryOf(normalized),
    size: raw?.size ?? null,
    sha: raw?.sha ?? null,
  };
  if (source?.ref) Object.assign(entry, remoteUrls(source.ref, normalized));
  return entry;
}

function enrichCompanions(entries) {
  const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry.path]));
  for (const entry of entries) {
    if (!isImage(entry)) continue;
    const lower = entry.path.toLowerCase();
    const stem = lower.replace(/\.(png|tga|jpg|jpeg)$/i, '');
    const candidates = [
      `${stem}.texture_set.json`,
      `${stem}_mers.tga`, `${stem}_mer.tga`, `${stem}_normal.tga`, `${stem}_height.tga`,
      `${stem}_mers.png`, `${stem}_mer.png`, `${stem}_normal.png`, `${stem}_height.png`,
      `${stem}.mcmeta`,
    ];
    const companions = candidates.map((candidate) => byPath.get(candidate)).filter(Boolean);
    if (companions.length) entry.companion_paths = [...new Set(companions)];
  }
  return entries;
}

function summarize(entries) {
  const countBy = (key) => Object.fromEntries(
    [...entries.reduce((map, entry) => {
      const value = entry[key] || 'unknown';
      map.set(value, (map.get(value) || 0) + 1);
      return map;
    }, new Map())].sort((a, b) => a[0].localeCompare(b[0])),
  );
  return {
    total_entries: entries.length,
    image_entries: entries.filter(isImage).length,
    by_category: countBy('category'),
    by_extension: countBy('extension'),
    by_role: countBy('role'),
  };
}

async function walk(root, current = root, result = []) {
  const names = await fs.readdir(current, { withFileTypes: true });
  for (const entry of names) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, result);
    else result.push(absolute);
  }
  return result;
}

function relativeTo(root, absolutePath) {
  return normalize(path.relative(root, absolutePath));
}

function localTextureScope(relativePath, root) {
  const normalized = normalize(relativePath).toLowerCase();
  const base = path.basename(root).toLowerCase();
  if (normalized.startsWith('textures/')) return true;
  if (['textures', 'assets', 'resource_pack'].includes(base)) {
    return normalized.startsWith('textures/') || normalized.includes('/textures/');
  }
  return normalized.includes('/resource_pack/textures/')
    || normalized.startsWith('resource_pack/textures/')
    || /(^|\/)assets\/[^/]+\/textures\//.test(normalized);
}

async function fetchTree(ref) {
  const url = `${API_ROOT}/${encodeURIComponent(ref)}?recursive=1`;
  const response = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'blockbench-minecraft-authoring-skill' },
  });
  if (!response.ok) throw new Error(`GitHub tree request failed: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (payload.truncated) throw new Error('GitHub returned a truncated tree; use --root with a local checkout.');
  return payload;
}

async function buildIndex() {
  const root = arg('root');
  const ref = String(arg('ref', 'main'));
  const defaultOut = path.resolve(process.cwd(), '.cache', 'minecraft-texture-corpus.json');
  const out = path.resolve(String(arg('out', defaultOut)));
  let entries;
  let treeSha = null;
  let source = 'local checkout';
  let sourceUrl = null;
  let localRoot = null;

  if (root) {
    localRoot = path.resolve(String(root));
    const files = await walk(localRoot);
    entries = [];
    for (const absolute of files) {
      const relative = relativeTo(localRoot, absolute);
      if (!localTextureScope(relative, localRoot)) continue;
      const stat = await fs.stat(absolute);
      const bytes = await fs.readFile(absolute);
      const sha = createHash('sha256').update(bytes).digest('hex');
      entries.push(makeEntry({ size: stat.size, sha }, relative, {}));
    }
  } else {
    const tree = await fetchTree(ref);
    source = 'Mojang bedrock-samples Git tree';
    sourceUrl = `${SOURCE_ROOT}/tree/${ref}`;
    treeSha = tree.sha;
    entries = tree.tree
      .filter((item) => item.type === 'blob')
      .filter((item) => item.path.startsWith('resource_pack/textures/') || item.path === 'resource_pack/manifest.json')
      .map((item) => makeEntry(item, item.path, { ref }));
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  enrichCompanions(entries);
  const output = {
    schema: 1,
    generated_at: new Date().toISOString(),
    source,
    source_url: sourceUrl,
    repository: root ? null : REPO,
    ref: root ? 'local' : ref,
    tree_sha: treeSha,
    local_root: localRoot,
    scope: 'texture resources and companion metadata under resource_pack/textures, assets/<namespace>/textures, or a direct textures root',
    redistributable_bytes: false,
    summary: summarize(entries),
    entries,
  };
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ out, source, ref: output.ref, tree_sha: treeSha, ...output.summary }, null, 2));
}

function filterEntries(data) {
  const category = arg('category');
  const role = arg('role');
  const match = arg('match');
  const exactPath = arg('path');
  const needle = match ? String(match).toLowerCase() : null;
  return data.entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (role && entry.role !== role) return false;
    if (exactPath && normalize(entry.path) !== normalize(exactPath)) return false;
    if (needle && !entry.path.toLowerCase().includes(needle)) return false;
    return true;
  });
}

async function readIndex() {
  const value = arg('index', path.resolve(process.cwd(), '.cache', 'minecraft-texture-corpus.json'));
  return JSON.parse(await fs.readFile(path.resolve(String(value)), 'utf8'));
}

async function queryIndex() {
  const data = await readIndex();
  const all = filterEntries(data);
  const limit = Number(arg('limit', 100));
  const shown = Number.isFinite(limit) && limit >= 0 ? all.slice(0, limit) : all;
  console.log(JSON.stringify({
    index_source: data.source,
    source_url: data.source_url,
    ref: data.ref,
    tree_sha: data.tree_sha,
    matched: all.length,
    returned: shown.length,
    entries: shown,
  }, null, 2));
}

function safeResolve(root, relative) {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error(`unsafe path outside root: ${relative}`);
  return target;
}

function selectedOutputPath(entry) {
  const prefix = 'resource_pack/textures/';
  if (entry.path.startsWith(prefix)) return entry.path.slice(prefix.length);
  const marker = entry.path.indexOf('/textures/');
  if (marker >= 0) return entry.path.slice(marker + '/textures/'.length);
  return entry.path;
}

async function fetchIndexEntries() {
  const data = await readIndex();
  if (!arg('out')) throw new Error('fetch requires --out DIR');
  if (!arg('match') && !arg('path') && !arg('category')) throw new Error('fetch requires --match, --path, or --category');
  const out = path.resolve(String(arg('out')));
  const limit = Number(arg('limit', 20));
  if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new Error('--limit must be an integer from 1 to 256');
  const includeMetadata = flag('include-metadata');
  const selected = filterEntries(data).filter((entry) => includeMetadata || isImage(entry)).slice(0, limit);
  if (!selected.length) throw new Error('no entries matched the selection');
  await fs.mkdir(out, { recursive: true });
  const force = flag('force');
  const fetched = [];
  for (const entry of selected) {
    const relative = selectedOutputPath(entry);
    const destination = safeResolve(out, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (!force) {
      try { await fs.access(destination); throw new Error(`destination exists; use --force: ${destination}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (data.local_root) {
      const source = safeResolve(data.local_root, entry.path);
      await fs.copyFile(source, destination);
    } else {
      if (!entry.raw_url) throw new Error(`index entry has no raw_url: ${entry.path}`);
      const response = await fetch(entry.raw_url, { headers: { 'user-agent': 'blockbench-minecraft-authoring-skill' } });
      if (!response.ok) throw new Error(`asset fetch failed: ${response.status} ${response.statusText} for ${entry.path}`);
      await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
    }
    const bytes = await fs.readFile(destination);
    fetched.push({ ...entry, fetched_path: destination, fetched_sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = {
    schema: 1,
    generated_at: new Date().toISOString(),
    source: data.source,
    source_url: data.source_url,
    ref: data.ref,
    tree_sha: data.tree_sha,
    image_bytes_are_temporary: true,
    includes_metadata: includeMetadata,
    entries: fetched,
  };
  await fs.writeFile(path.join(out, '_reference-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ out, selected: fetched.length, manifest: path.join(out, '_reference-manifest.json'), ref: data.ref, tree_sha: data.tree_sha }, null, 2));
}

async function main() {
  const action = command();
  if (action === 'help' || action === '--help' || action === '-h') return printHelp();
  if (action === 'index') return buildIndex();
  if (action === 'query') return queryIndex();
  if (action === 'fetch') return fetchIndexEntries();
  printHelp();
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
