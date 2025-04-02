import { BaseUdf } from './baseUdf';
import { ICodeAgent } from '../types';
import { Type, Static } from '@sinclair/typebox';
import axios from 'axios';

export class BraveSearchUdf extends BaseUdf {
  name = 'braveWebSearch';

  description = 'Search the web for information using Brave';

  inputSchema = Type.Object(
    {
      q: Type.String({ description: 'The search query' }),
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
          country: Type.Optional(Type.String({ description: 'The country' })),
          freshness: Type.Optional(
            Type.String({
              description:
                'The freshness of the results, must be in the form "YYYY-MM-DDtoYYYY-MM-DD"',
            }),
          ),
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

  private endpoint = 'https://api.search.brave.com/res/v1/web/search';

  private apiKey = process.env.BRAVE_SEARCH_API_KEY;

  constructor(public urlBlacklist: string[] = []) {
    super();
    if (!this.apiKey) {
      throw new Error('BRAVE_SEARCH_API_KEY is not set');
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
    const query = this.buildQuery(input.q, input.options);
    const url = new URL(this.endpoint);
    url.searchParams.append('q', query);
    url.searchParams.append(
      'count',
      input?.options?.count?.toString() || this.maxResults.toString(),
    );

    if (input.options) {
      if (input.options.country) {
        url.searchParams.append('country', input.options.country);
      }
      if (input.options.freshness) {
        url.searchParams.append('freshness', input.options.freshness);
      }
      if (input.options.offset !== undefined) {
        url.searchParams.append('offset', input.options.offset.toString());
      }
    }

    const response = await axios.get(url.toString(), {
      headers: {
        'X-Subscription-Token': this.apiKey,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
      },
    });

    if (response.status >= 300) {
      throw new Error(
        `Brave search API request failed with status ${response.status}`,
      );
    }

    const results = (response?.data?.web?.results || []).map((result: any) => ({
      title: result.title,
      link: result.url,
      snippet: result.description,
    }));

    if (results.length === 0) {
      return [];
    }

    return results;
  }

  override async getCallResultSummary(
    output: Static<typeof this.outputSchema>,
  ): Promise<string | null> {
    if (output.length === 0) {
      return 'No results found';
    }
    return `Fetched ${output.length} results from Brave. \n${output
      .map((result) => `- ${result.title}\n${result.link}\n${result.snippet}`)
      .join('\n')}`;
  }
}
