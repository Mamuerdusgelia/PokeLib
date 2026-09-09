import { parseBatch } from './showdown';
import type { FormatContext } from './formats';

const maximumBytes = 1000000;
export function pokepasteUrl(input: unknown) {
  const invalid =
    'Use a PokéPaste URL such as https://pokepast.es/0123456789abcdef.';
  if (typeof input !== 'string' || input.length > 2048) throw Error(invalid);
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw Error(invalid);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'pokepast.es' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/[a-f0-9]{16}\/?$/i.test(url.pathname)
  )
    throw Error(invalid);
  return 'https://pokepast.es/' + url.pathname.split('/')[1].toLowerCase();
}

export async function readPokepaste(
  input: unknown,
  fetcher: typeof fetch = fetch,
) {
  const url = pokepasteUrl(input),
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(url + '/json', {
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (
      (response.status >= 300 && response.status < 400) ||
      response.redirected
    )
      throw Error(
        'PokéPaste redirected this request. Open the original paste and copy its Showdown text instead.',
      );
    if (response.status === 404) throw Error('This PokéPaste was not found.');
    if (!response.ok)
      throw Error(
        'PokéPaste is unavailable right now. Try again or paste the Showdown text.',
      );
    if (Number(response.headers.get('content-length') || 0) > maximumBytes)
      throw Error('This PokéPaste is too large to import.');
    if (!response.body) throw Error('PokéPaste returned an empty response.');
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let bytes = 0,
      body = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maximumBytes)
          throw Error('This PokéPaste is too large to import.');
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel();
    }
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw Error();
      data = parsed as Record<string, unknown>;
    } catch {
      throw Error(
        'PokéPaste returned an invalid response. Paste the Showdown text instead.',
      );
    }
    if (
      typeof data.paste !== 'string' ||
      !data.paste.trim() ||
      data.paste.length > 150000
    )
      throw Error('PokéPaste did not contain a supported team export.');
    const warnings: string[] = [];
    function metadata(key: string, maximum: number) {
      if (data[key] === undefined || data[key] === null) return '';
      if (typeof data[key] !== 'string')
        throw Error('PokéPaste returned invalid ' + key + ' metadata.');
      const value = (data[key] as string).trim();
      if (value.length > maximum)
        warnings.push(
          'PokéPaste ' + key + ' was shortened to ' + maximum + ' characters.',
        );
      return value.slice(0, maximum);
    }
    return {
      url,
      text: data.paste,
      title: metadata('title', 160),
      author: metadata('author', 200),
      notes: metadata('notes', 10000),
      warnings,
    };
  } catch (e) {
    if (controller.signal.aborted)
      throw Error(
        'PokéPaste took too long to respond. Try again or paste the Showdown text.',
      );
    if (e instanceof TypeError)
      throw Error(
        'Could not reach PokéPaste. Try again or paste the Showdown text.',
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function previewPokepaste(
  input: unknown,
  format = 'unknown',
  context?: FormatContext,
  fetcher?: typeof fetch,
) {
  const paste = await readPokepaste(input, fetcher);
  const common = {
    source_type: 'PokéPaste',
    source_name: paste.author,
    source_url: paste.url,
    source_note: paste.title ? 'PokéPaste: ' + paste.title : '',
    team_notes: paste.notes,
    team_date: null,
    team_date_precision: 'unknown' as const,
  };
  const batch = parseBatch(paste.text, format, context);
  return {
    text: paste.text,
    common,
    batch: batch.map((row) => ({
      draft: {
        ...row.draft,
        ...common,
        title:
          batch.length === 1 && paste.title ? paste.title : row.draft.title,
      },
      warnings: [...row.warnings, ...paste.warnings],
    })),
  };
}
