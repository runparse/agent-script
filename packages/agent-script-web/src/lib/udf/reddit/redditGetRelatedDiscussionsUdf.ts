import { BaseUdf, ChatModel, IChatModel } from '@runparse/agent-script';
import { RedditApiClient } from './client';
import { Static, Type } from '@sinclair/typebox';
import { getSuccientComment } from './utilts';
import { sleep } from 'openai/core';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources';

const redditPostSchema = Type.Object({
  title: Type.String(),
  content: Type.String(),
  url: Type.String(),
  comments: Type.Array(
    Type.Object({
      content: Type.String(),
      when: Type.String(),
      replies: Type.Optional(
        Type.Array(
          Type.Object({
            content: Type.String(),
            when: Type.String(),
          }),
        ),
      ),
    }),
  ),
});

export class RedditGetRelatedDiscussionsUdf extends BaseUdf {
  name = 'redditGetRelatedDiscussions';
  description = 'Get related discussions from Reddit';

  inputSchema = Type.Object({
    goal: Type.String({
      description: 'Describe your goal for the search in one sentence',
    }),
    query: Type.String({
      description: 'Search query term or keywords',
    }),
    subreddit: Type.Optional(
      Type.String({
        description: 'Name of the subreddit',
      }),
    ),
    targetCount: Type.Optional(
      Type.Number({
        description:
          'The number of related discussions to return, default 5, max 10',
        default: 5,
        maximum: 10,
      }),
    ),
    offset: Type.Optional(
      Type.Number({
        description: '# posts to skip for pagination, default 0',
        default: 0,
      }),
    ),
    time: Type.Optional(
      Type.Union(
        [
          Type.Literal('year'),
          Type.Literal('month'),
          Type.Literal('week'),
          Type.Literal('day'),
        ],
        {
          default: 'month',
          description: 'The time period to search for posts, default to month',
        },
      ),
    ),
  });

  outputSchema = Type.Array(redditPostSchema);

  private offset: number = 0;

  constructor(
    private redditApiClient: RedditApiClient = new RedditApiClient(),
    private model: IChatModel = new ChatModel({
      provider: 'openai',
      model: 'gpt-4o',
    }),
  ) {
    super();
  }

  async call(input: Static<typeof this.inputSchema>) {
    const limit = 5;
    this.offset = input.offset || 0;
    const results: Static<typeof this.outputSchema> = [];

    try {
      while (true) {
        console.log(
          `Getting related discussions from search with offset ${this.offset}`,
        );

        const postBatch = await this.getRelatedDiscussionsFromSearch({
          query: input.query,
          subreddit: input.subreddit,
          time: input.time,
          limit: limit,
          offset: this.offset,
        });

        console.log(
          `Extracting related discussions from search with offset ${this.offset}`,
        );
        const response = await this.model.chatCompletionWithSchema(
          extractRelatedDiscussionsPrompt(input.goal, postBatch),
        );

        const relatedPosts: { postId: string; commentIds: string[] }[] =
          JSON.parse(response.message.content).posts;

        const relatedPostsWithComments = relatedPosts
          .map((post) => {
            const originalPost = postBatch.find((p) => p.id === post.postId);
            if (!originalPost) {
              return undefined;
            }
            return {
              ...originalPost,
              comments: post.commentIds
                .map((id) => originalPost.comments.find((c) => c.id === id))
                .filter((c) => c !== undefined),
            };
          })
          .filter((p) => p !== undefined);

        console.log(
          `Found ${
            relatedPostsWithComments.length
          } related discussions with offset ${this.offset}: ${JSON.stringify(
            relatedPostsWithComments,
            null,
            2,
          )}`,
        );

        results.push(...relatedPostsWithComments);

        this.offset += limit;
        if (postBatch.length < limit) {
          break;
        }

        if (this.offset >= (input.targetCount ?? 10) * 5) {
          break;
        }

        if (results.length >= (input.targetCount ?? 10)) {
          break;
        }
      }

      return results;
    } catch (error) {
      if (results.length > 0) {
        return results;
      }
      throw error;
    }
  }

  private async getRelatedDiscussionsFromSearch({
    query,
    subreddit,
    time = 'month',
    limit = 10,
    offset = 0,
  }: {
    query: string;
    subreddit?: string;
    time?: 'year' | 'month' | 'week' | 'day';
    limit?: number;
    offset?: number;
  }) {
    const posts = await this.redditApiClient.getTopSubmissions({
      search: { q: query },
      subreddit: subreddit,
      time: time,
      limit: limit,
      offset: offset,
    });

    const postsWithComments: typeof posts = [];
    for (const post of posts) {
      const postWithComments = await this.redditApiClient.getSubmissionComments(
        post.subreddit.display_name,
        post.id,
      );
      postsWithComments.push(postWithComments);
      await sleep(1000);
    }

    return postsWithComments.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.selftext,
      url: post.url,
      comments: post.comments.map((comment) => getSuccientComment(comment)),
    }));
  }

  override async getCallResultSummary(
    output: Static<typeof this.outputSchema>,
  ): Promise<string | null> {
    const firstSubmission = output[0];
    if (!firstSubmission) {
      return null;
    }
    return `Fetched ${output.length} related submissions. We have hidden ${
      output.length - 1
    } submissions in the result list for brevity. Here is the first submission with the first comments:\n\n[${JSON.stringify(
      {
        title: firstSubmission.title,
        content: firstSubmission.content,
        url: firstSubmission.url,
        comments: firstSubmission.comments.slice(0, 1),
      },
      undefined,
      2,
    )}...]`;
  }
}

function extractRelatedDiscussionsPrompt(
  goal: string,
  posts: Array<Static<typeof redditPostSchema>>,
): ChatCompletionCreateParamsNonStreaming {
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant. You are given a list of reddit posts. Your job is to filter the list to only include posts and commentsthat are related to the goal ${goal}.`,
    },
    {
      role: 'user',
      content: `Return the list of posts and comments that are related to the goal.`,
    },
    {
      role: 'user',
      content: posts
        .map((item, i) => `- Item ${i}: ${JSON.stringify(item)}`)
        .join('\n'),
    },
  ];

  const responseFormatSchemaConfig = {
    type: 'json_schema',
    json_schema: {
      name: 'analyze_list_response',
      strict: true,
      schema: Type.Object(
        {
          posts: Type.Array(
            Type.Object(
              {
                postId: Type.String(),
                commentIds: Type.Array(Type.String()),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    },
  };

  return {
    // @ts-ignore outdated openai version in token.js
    messages,
    stream: false,
    // @ts-ignore outdated openai version in token.js
    response_format: responseFormatSchemaConfig,
  };
}
