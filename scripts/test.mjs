import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
await fs.mkdir('.test-build', { recursive: true });
for (const name of [
  'domain',
  'public-config',
  'showdown',
  'search',
  'demo',
  'snapshot',
  'demo-store',
  'supabase-store',
  'visual-team',
  'format-groups',
  'search-filters',
]) {
  const source = await fs.readFile(
    path.join(root, 'lib', name + '.ts'),
    'utf8',
  );
  const out = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace(
      /from '(\.\/[^']+)'/g,
      (_, p) => "from '" + p + ".mjs'",
    );
  await fs.writeFile(path.join(root, '.test-build', name + '.mjs'), out);
}
try {
  await import('./test-core.mjs');
  await import('./test-postgres.mjs');
  await import('./test-ux.mjs');
} catch (e) {
  console.error({
    message: e.message,
    position: e.position,
    where: e.where,
    detail: e.detail,
    sql: e.position
      ? e.query?.slice(
          Math.max(0, Number(e.position) - 100),
          Number(e.position) + 100,
        )
      : undefined,
  });
  process.exit(1);
}
