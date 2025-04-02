import * as Snoowrap from 'snoowrap';
import { createSnoowrapInstance } from './utilts';

export const REDDIT_API_SUBMISSION_COMMENT_DEPTH = 1;
export const REDDIT_API_COMMENT_CONTEXT_SIZE = 3;
export const REDDIT_API_LIST_LIMIT_MAX = 100;

export class RedditApiClient {
  constructor(private client: Snoowrap = createSnoowrapInstance({})) {}

  async getUser(username: string): Promise<Omit<Snoowrap.RedditUser, 'then'>> {
    return this.client.oauthRequest({
      uri: `/user/${username}/about`,
      method: 'get',
    });
  }

  async getTopSubmissions({
    subreddit,
    time = 'year',
    limit,
    offset = 0,
    after,
    beforeId,
    search,
  }: {
    subreddit?: string;
    time?: Snoowrap.BaseSearchOptions['time'];
    after?: string;
    beforeId?: string;
    limit?: number;
    offset?: number;
    search?: {
      q: string;
    };
  }): Promise<Array<Omit<Snoowrap.Submission, 'then'>>> {
    if (search) {
      return this.client.search({
        subreddit,
        query: search.q,
        time,
        after,
        before: beforeId,
        limit: Math.min(
          limit || REDDIT_API_LIST_LIMIT_MAX,
          REDDIT_API_LIST_LIMIT_MAX,
        ),
        count: offset,
        type: 'link',
        sort: 'top',
      });
    }
    return this.client.getTop(subreddit, {
      time,
      after: after,
      before: beforeId,
      limit: Math.min(
        limit || REDDIT_API_LIST_LIMIT_MAX,
        REDDIT_API_LIST_LIMIT_MAX,
      ),
      count: offset,
    });
  }

  async getSubmissionComments(
    subreddit: string,
    submissionId: string,
    commentId?: string,
    limit?: number,
  ): Promise<Omit<Snoowrap.Submission, 'then'>> {
    return this.client.oauthRequest({
      uri: `/r/${subreddit}/comments/${submissionId}`,
      method: 'get',
      qs: {
        comment: commentId,
        depth: REDDIT_API_SUBMISSION_COMMENT_DEPTH,
        context: REDDIT_API_COMMENT_CONTEXT_SIZE,
        limit: Math.min(
          limit || REDDIT_API_LIST_LIMIT_MAX,
          REDDIT_API_LIST_LIMIT_MAX,
        ),
        threaded: true,
      },
    });
  }

  async getUserSubmissions({
    username,
    limit,
    after = undefined,
    itemsSeenCount = undefined,
  }: {
    username: string;
    limit?: number;
    after?: string;
    itemsSeenCount?: number;
  }): Promise<{
    submissions: Array<Omit<Snoowrap.Submission, 'then'>>;
    lastItemFullname?: string;
    itemsSeenCount: number;
  }> {
    const submissions = await this.client.getUser(username).getSubmissions({
      limit: Math.min(
        limit || REDDIT_API_LIST_LIMIT_MAX,
        REDDIT_API_LIST_LIMIT_MAX,
      ),
      sort: 'top',
      after,
      count: itemsSeenCount,
    });
    return {
      submissions,
      lastItemFullname:
        submissions.length > 0
          ? submissions[submissions.length - 1]?.name
          : undefined,
      itemsSeenCount: (itemsSeenCount ?? 0) + submissions.length,
    };
  }

  async getUserComments({
    username,
    limit,
    after = undefined,
    itemsSeenCount = undefined,
    sortType = 'new',
  }: {
    username: string;
    limit?: number;
    after?: string;
    itemsSeenCount?: number;
    sortType?: string;
  }): Promise<{
    comments: Array<Omit<Snoowrap.Comment, 'then'>>;
    lastItemFullname?: string;
    itemsSeenCount: number;
  }> {
    const comments = await this.client.getUser(username).getComments({
      limit: Math.min(
        limit || REDDIT_API_LIST_LIMIT_MAX,
        REDDIT_API_LIST_LIMIT_MAX,
      ),
      sort: sortType,
      after,
      count: itemsSeenCount,
      context: REDDIT_API_COMMENT_CONTEXT_SIZE,
    });
    return {
      comments,
      lastItemFullname:
        comments.length > 0 ? comments[comments.length - 1]?.name : undefined,
      itemsSeenCount: (itemsSeenCount ?? 0) + comments.length,
    };
  }

  async getSubmissionById(
    subreddit: string,
    threadId: string,
  ): Promise<Omit<Snoowrap.Submission, 'then'>> {
    return this.client.oauthRequest({
      uri: `/r/${subreddit}/comments/${threadId}`,
      method: 'get',
    });
  }

  async getSubmissionByUrl(
    url: string,
  ): Promise<Omit<Snoowrap.Submission, 'then'>> {
    return this.client.oauthRequest({
      uri: url,
      method: 'get',
    });
  }
}
