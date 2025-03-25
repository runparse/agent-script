import { search, SearchOptions } from 'duck-duck-scrape';
import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';

export class DuckduckgoSearchUdf extends BaseUdf {
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
    agent: ICodeAgent,
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
