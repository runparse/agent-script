import { Page, PageScreenshotOptions } from 'playwright';
import sharp from 'sharp';

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

export enum VisualQuality {
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export const VisualQualityParams: Record<
  VisualQuality,
  { width: number; height: number; quality: number }
> = {
  [VisualQuality.MEDIUM]: {
    width: 1024,
    height: 1024,
    quality: 90,
  },
  [VisualQuality.LOW]: {
    width: 512,
    height: 512,
    quality: 70,
  },
};

export async function getBase64Screenshot(
  page: Page,
  options: { visualQuality: VisualQuality } & PageScreenshotOptions = {
    visualQuality: VisualQuality.MEDIUM,
  },
): Promise<{ data: string; metadata: { width: number; height: number } }> {
  const { width, height, quality } = VisualQualityParams[options.visualQuality];
  const screenshot = sharp(await page.screenshot({ ...options }))
    .resize(width, height, { fit: 'contain' })
    .jpeg({ quality });

  return {
    data: `data:image/jpeg;base64,${(await screenshot.toBuffer()).toString(
      'base64',
    )}`,
    metadata: { width, height },
  };
}
