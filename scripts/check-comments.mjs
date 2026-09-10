import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSync } from 'oxc-parser';

const ROOTS = ['src', 'examples/playground/src'];
const SOURCE_FILE = /\.(?:ts|tsx|mts|mjs|js|jsx)$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);
const DIRECTIVE_PREFIXES = ['oxlint-', '@ts-'];
const EXPORT_AFTER_COMMENT = /^\s*export\b/;

const collectSourceFiles = (directory) => {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : collectSourceFiles(entryPath);
    }

    return SOURCE_FILE.test(entry.name) ? [entryPath] : [];
  });
};

const isToolingDirective = (comment) =>
  DIRECTIVE_PREFIXES.some((prefix) => comment.value.trimStart().startsWith(prefix));

const isJsDocOverExport = (comment, sourceText) =>
  comment.type === 'Block' &&
  comment.value.startsWith('*') &&
  EXPORT_AFTER_COMMENT.test(sourceText.slice(comment.end));

const lineOf = (sourceText, offset) => sourceText.slice(0, offset).split('\n').length;

const findViolations = (filePath) => {
  const sourceText = readFileSync(filePath, 'utf8');
  const { comments } = parseSync(filePath, sourceText);

  return comments
    .filter((comment) => !isToolingDirective(comment) && !isJsDocOverExport(comment, sourceText))
    .map(
      (comment) =>
        `${filePath}:${lineOf(sourceText, comment.start)} — only JSDoc directly above an export is allowed`,
    );
};

const violations = ROOTS.flatMap(collectSourceFiles).flatMap(findViolations);

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exit(1);
}
