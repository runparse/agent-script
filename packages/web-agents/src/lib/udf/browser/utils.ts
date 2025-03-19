import { Page, Locator } from 'playwright';

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
