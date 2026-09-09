import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
await fs.mkdir('.test-build', { recursive: true });
for (const name of [
  'formats',
  'import-workflow',
  'domain',
  'public-config',
  'showdown',
  'search',
  'demo',
  'snapshot',
  'demo-store',
  'variants',
  'demo-variants',
  'supabase-store',
  'visual-team',
  'format-groups',
  'search-filters',
  'builder-data',
  'showdown-learnsets',
  'showdown-builder',
  'builder-defaults',
  'pokemon-sprites',
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
    .outputText.replace(/from '(\.\/[^']+)'/g, (_, p) => "from '" + p + ".mjs'")
    .replace(
      /from '(\.\/[^']+\.json)\.mjs'/g,
      (_, p) => "from '" + p + "' with {type:'json'}",
    )
    .replace(/import\('(\.\/[^']+)'/g, (_, p) =>
      p.endsWith('.json')
        ? "import('" + p + "', {with:{type:'json'}}"
        : "import('" + p + ".mjs'",
    );
  await fs.writeFile(path.join(root, '.test-build', name + '.mjs'), out);
}
await fs.cp('lib/showdown-data', '.test-build/showdown-data', {
  recursive: true,
});
try {
  await import('./test-core.mjs');
  await import('./test-postgres.mjs');
  await import('./test-ux.mjs');
  await import('./test-builder.mjs');
  await import('./test-showdown.mjs');
  await import('./test-defaults.mjs');
  await import('./test-formats.mjs');
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
