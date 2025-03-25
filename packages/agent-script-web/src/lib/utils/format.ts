export function removeLeadingIndentation(
  content: string,
  excludeFirstNonEmptyLine: boolean = true,
): string {
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const linesToConsider = excludeFirstNonEmptyLine
    ? nonEmptyLines.slice(1)
    : nonEmptyLines;
  const minIndentation = Math.min(
    ...linesToConsider.map((line) => line.match(/^\s*/)?.[0]?.length || 0),
  );

  return lines
    .map((line) =>
      line.startsWith(' '.repeat(minIndentation))
        ? line.slice(minIndentation)
        : line,
    )
    .join('\n');
}
