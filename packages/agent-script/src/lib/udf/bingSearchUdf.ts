import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
import axios from 'axios';

export class BingSearchUdf extends BaseUdf {
  name = 'bingSearch';

  description = 'Search the web for information using Bing';

  inputSchema = Type.Object(
    {
      query: Type.String({ description: 'The search query' }),
      options: Type.Optional(
        Type.Object({
          site: Type.Optional(
            Type.String({ description: 'The site to search' }),
          ),
          count: Type.Optional(
            Type.Number({ description: 'Number of results to return' }),
          ),
          offset: Type.Optional(
            Type.Number({
              description: 'Result pagination offset',
            }),
          ),
          market: Type.Optional(Type.String({ description: 'The market' })),
          // exclude: Type.Optional(
          //   Type.Union([Type.String(), Type.Array(Type.String())]),
          // ),
          // filetype: Type.Optional(Type.String()),
          // intitle: Type.Optional(Type.String()),
          // inurl: Type.Optional(Type.String()),
        }),
      ),
    },
    {
      default: {
        query: 'string',
        options: {
          site: 'string',
          count: 20,
          offset: 0,
          market: 'en-US',
          // exclude: [],
          // filetype: '',
          // intitle: '',
          // inurl: '',
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

  private maxResults = 10;

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
      // if (options.filetype) {
      //   queryParts.push(`filetype:${options.filetype}`);
      // }
      // if (options.intitle) {
      //   queryParts.push(`intitle:${options.intitle}`);
      // }
      // if (options.inurl) {
      //   queryParts.push(`inurl:${options.inurl}`);
      // }
      // if (options.exclude) {
      //   // Handle multiple exclusion keywords.
      //   if (Array.isArray(options.exclude)) {
      //     options.exclude.forEach((keyword) => {
      //       queryParts.push(`-${keyword}`);
      //     });
      //   } else {
      //     queryParts.push(`-${options.exclude}`);
      //   }
      // }
    }

    return queryParts.join(' ');
  }

  override async call(
    input: Static<typeof this.inputSchema>,
    agent: ICodeAgent,
  ): Promise<Static<typeof this.outputSchema>> {
    const query = this.buildQuery(input.query, input.options);
    const url = new URL(this.endpoint);
    url.searchParams.append('q', query);
    url.searchParams.append(
      'count',
      input?.options?.count?.toString() || this.maxResults.toString(),
    );

    if (input.options) {
      if (input.options.market) {
        url.searchParams.append('mkt', input.options.market);
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
