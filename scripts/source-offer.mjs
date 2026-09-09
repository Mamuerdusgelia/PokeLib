// Build corresponding source from explicitly version-controlled application files.
// Local databases, runtime secrets, .git, ignored artifacts and user data are never inputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = process.cwd();
const hasGit = await fs.stat(path.join(root, '.git')).then(
  () => true,
  () => false,
);
// Downloaded corresponding source has a manifest instead of repository metadata.
const listed = hasGit
  ? execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
  : Object.keys(
      JSON.parse(await fs.readFile('SOURCE_MANIFEST.json', 'utf8')).files,
    );
const directories =
  /^(app|components|hooks|lib|db|drizzle|supabase|scripts|public)\//;
const configs = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'next.config.ts',
  'drizzle.config.ts',
  'postcss.config.mjs',
  'components.json',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.gitignore',
  '.gitattributes',
  '.env.example',
  '.openai/hosting.json',
  '.openai/wrangler.local.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'SHOWDOWN_INTEGRATION.md',
  'PROGRESS.md',
  'DECISIONS.md',
  'SCHEMA_PLAN.md',
  'PERFORMANCE.md',
]);
const allowed = (name) =>
  (directories.test(name) || configs.has(name)) &&
  !name.startsWith('public/source/') &&
  !/\.(db|sqlite|sqlite3|pem|key)$/.test(name) &&
  (!/(^|\/)\.env/.test(name) || name === '.env.example');
const untracked = hasGit
  ? execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter((n) => n && allowed(n))
  : [];
if (untracked.length)
  throw Error(
    'Stage new application source before packaging: ' + untracked.join(', '),
  );
const files = listed.filter(allowed);
for (const required of [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'SHOWDOWN_INTEGRATION.md',
  'package.json',
])
  if (!files.includes(required))
    throw Error('Missing source-offer file ' + required);
await fs.mkdir(path.join(root, '.artifacts'), { recursive: true });
const temp = await fs.mkdtemp(path.join(root, '.artifacts', 'source-'));
const stage = path.join(temp, 'teamvault');
await fs.mkdir(stage);
const hashes = {};
for (const name of files) {
  const absolute = path.resolve(root, name);
  if (!absolute.startsWith(root + path.sep)) throw Error('Unsafe source path');
  const bytes = await fs.readFile(absolute);
  const destination = path.join(stage, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
}
await fs.writeFile(
  path.join(stage, 'SOURCE_MANIFEST.json'),
  JSON.stringify({ license: 'AGPL-3.0-only', files: hashes }, null, 2),
);
await fs.mkdir('public/source', { recursive: true });
const archive = path.join(root, 'public/source/teamvault-source.tar');
execFileSync('tar', ['-C', temp, '-cf', archive, 'teamvault']);
const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' });
if (
  !entries.includes('teamvault/LICENSE') ||
  !entries.includes('teamvault/app/layout.tsx') ||
  /teamvault\/\.env\n|\.sqlite|\.git\//.test(entries)
)
  throw Error('Source archive validation failed');
console.log(
  `Corresponding source: ${files.length} files; no runtime env, database or user content.`,
);
