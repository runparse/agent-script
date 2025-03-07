import { search, SearchOptions } from 'duck-duck-scrape';
import { BaseTool } from '../baseTool';
import { IMultiStepAgent } from '../../types';
import { Type, TArray, TObject, TString, Static } from '@sinclair/typebox';

export class DuckduckgoSearchTool extends BaseTool<
  TObject<{
    query: TString;
  }>,
  TArray<
    TObject<{
      title: TString;
      link: TString;
      snippet: TString;
    }>
  >
> {
  name = 'duckduckgoSearch';

  description =
    'A search engine. Useful for when you need to answer questions about current events.';

  inputSchema = Type.Object(
    {
      query: Type.String(),
    },
    { default: { query: 'string' } },
  );

  outputSchema = Type.Array(
    Type.Object({
      title: Type.String(),
      link: Type.String(),
      snippet: Type.String(),
    }),
    { default: [{ title: 'string', link: 'string', snippet: 'string' }] },
  );

  private searchOptions?: SearchOptions;

  private maxResults = 10;

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IMultiStepAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const { results } = await search(input.query, this.searchOptions);

    return results
      .map((result) => ({
        title: result.title,
        link: result.url,
        snippet: result.description,
      }))
      .slice(0, this.maxResults);
  }
}
