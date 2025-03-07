import { BaseTool } from '../baseTool';
import { IMultiStepAgent } from '../../types';
import {
  Type,
  TArray,
  TObject,
  TString,
  Static,
  TNumber,
  TOptional,
  TUnion,
} from '@sinclair/typebox';
import axios from 'axios';

export class BingSearchTool extends BaseTool<
  TObject<{
    query: TString;
    options: TOptional<
      TObject<{
        site: TOptional<TString>;
        filetype: TOptional<TString>;
        intitle: TOptional<TString>;
        inurl: TOptional<TString>;
        exclude: TOptional<TUnion<[TString, TArray<TString>]>>; // Keyword(s) to exclude from the search results.
        market: TOptional<TString>; // e.g., "en-US"
        count: TOptional<TNumber>; // Number of results to return.
        offset: TOptional<TNumber>; // Pagination offset.
      }>
    >;
  }>,
  TArray<
    TObject<{
      title: TString;
      link: TString;
      snippet: TString;
    }>
  >
> {
  name = 'bingSearch';

  description =
    'A search engine. Useful for when you need to answer questions about current events.';

  inputSchema = Type.Object(
    {
      query: Type.String(),
      options: Type.Optional(
        Type.Object({
          site: Type.Optional(Type.String()),
          filetype: Type.Optional(Type.String()),
          intitle: Type.Optional(Type.String()),
          inurl: Type.Optional(Type.String()),
          exclude: Type.Optional(
            Type.Union([Type.String(), Type.Array(Type.String())]),
          ),
          market: Type.Optional(Type.String()),
          count: Type.Optional(Type.Number()),
          offset: Type.Optional(Type.Number()),
        }),
      ),
    },
    {
      default: {
        query: 'string',
        options: {
          site: 'string',
          count: 50,
          offset: 0,
          market: 'en-US',
          exclude: [],
          filetype: '',
          intitle: '',
          inurl: '',
        },
      },
    },
  );

  outputSchema = Type.Array(
    Type.Object({
      title: Type.String(),
      link: Type.String(),
      snippet: Type.String(),
    }),
    { default: [{ title: 'string', link: 'string', snippet: 'string' }] },
  );

  private maxResults = 50;

  private endpoint = 'https://api.bing.microsoft.com/v7.0/search';

  private apiKey = process.env.BING_API_KEY;

  constructor(public urlBlacklist: string[] = []) {
    super();
    if (!this.apiKey) {
      throw new Error('BING_API_KEY is not set');
    }
  }

  /**
   * Builds the final query string by combining the base query with various optional search modifiers.
   * @param baseQuery The main search query.
   * @param options Optional parameters to refine the search.
   * @returns A constructed query string.
   */
  private buildQuery(
    baseQuery: string,
    options?: Static<typeof this.inputSchema>['options'],
  ): string {
    let queryParts: string[] = [baseQuery];

    if (options) {
      if (options.site) {
        queryParts.push(`site:${options.site}`);
      }
      if (options.filetype) {
        queryParts.push(`filetype:${options.filetype}`);
      }
      if (options.intitle) {
        queryParts.push(`intitle:${options.intitle}`);
      }
      if (options.inurl) {
        queryParts.push(`inurl:${options.inurl}`);
      }
      if (options.exclude) {
        // Handle multiple exclusion keywords.
        if (Array.isArray(options.exclude)) {
          options.exclude.forEach((keyword) => {
            queryParts.push(`-${keyword}`);
          });
        } else {
          queryParts.push(`-${options.exclude}`);
        }
      }
    }

    return queryParts.join(' ');
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: IMultiStepAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const query = this.buildQuery(input.query, input.options);
    const url = new URL(this.endpoint);
    url.searchParams.append('q', query);

    if (input.options) {
      if (input.options.market) {
        url.searchParams.append('mkt', input.options.market);
      }
      if (input.options.count !== undefined) {
        url.searchParams.append(
          'count',
          input.options.count.toString() || this.maxResults.toString(),
        );
      }
      if (input.options.offset !== undefined) {
        url.searchParams.append('offset', input.options.offset.toString());
      }
    }

    const response = await axios.get(url.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
      },
    });

    if (response.status >= 300) {
      throw new Error(
        `Bing search API request failed with status ${response.status}`,
      );
    }

    return response.data.webPages.value
      .filter((result: any) => !this.urlBlacklist.includes(result.url))
      .map((result: any) => ({
        title: result.name,
        link: result.url,
        snippet: result.snippet,
      }));
  }
}
