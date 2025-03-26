import { Page, Locator, PageScreenshotOptions } from 'playwright';
import sharp from 'sharp';

export enum ElementRole {
  BUTTON = 'button',
  LINK = 'link',
}

export async function getBestElementByText({
  page,
  text,
  role,
  exact,
  elementIndex,
}: {
  page: Page;
  text: string;
  role?: ElementRole;
  exact: boolean;
  elementIndex?: number;
}): Promise<{
  candidates?: Locator[];
  match: Locator | null;
}> {
  let elementsLocator: Locator;
  if (role) {
    elementsLocator = page.getByRole(role, { exact, name: text });
  } else {
    elementsLocator = page.getByText(text, { exact });
  }

  const elements = await elementsLocator.all();

  if (elements.length >= 1) {
    if (elementIndex && elementIndex >= 0 && elementIndex < elements.length) {
      return {
        candidates: elements,
        match: elements[elementIndex]!,
      };
    }
    return {
      candidates: elements,
      match: elements[0]!,
    };
  }

  return {
    match: null,
  };
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
} as const;

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
