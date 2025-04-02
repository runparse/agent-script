import { BaseUdf, fulfilled, notEmpty } from '@runparse/agent-script';
import { RedditApiClient } from './client';
import { Static, Type } from '@sinclair/typebox';
import { getSuccientComment } from './utilts';

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

export class RedditGetDiscussionsUdf extends BaseUdf {
  name = 'redditGetDiscussions';
  description = 'Get a list of discussions from Reddit by urls';

  inputSchema = Type.Array(
    Type.String({
      description: 'The url of the discussion',
    }),
  );

  outputSchema = Type.Array(redditPostSchema);

  constructor(
    private redditApiClient: RedditApiClient = new RedditApiClient(),
  ) {
    super();
  }

  async call(input: Static<typeof this.inputSchema>) {
    const submissions = await Promise.allSettled(
      input.map(async (url) => {
        if (!url.includes('reddit.com')) {
          throw new Error('Reddit url must include reddit.com');
        }
        return await this.redditApiClient.getSubmissionByUrl(
          url.replace('https://www.reddit.com', ''),
        );
      }),
    );
    return submissions
      .filter(fulfilled)
      .filter(notEmpty)
      .map((result) => {
        const submission = result.value!;
        return {
          id: submission.id,
          title: submission.title,
          content: submission.selftext,
          url: submission.url,
          comments: submission.comments?.map((comment) =>
            getSuccientComment(comment),
          ),
        };
      });
  }

  override async getCallResultSummary(
    output: Static<typeof this.outputSchema>,
  ): Promise<string | null> {
    return `Fetched ${output.length} discussions from Reddit:\n${output
      .map((o) => {
        const contentBody = o.content || '';
        const truncatedBody = contentBody.substring(0, 300);
        return `\n\n-- Title: ${
          o.title
        }\nBody: ${truncatedBody}\nComments:\n${o.comments
          ?.slice(0, 3)
          .map((c) => `  - ${c.content}`)
          .join('\n')}`;
      })
      .join('\n')}`;
  }
}
