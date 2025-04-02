import Snoowrap from 'snoowrap';

export interface SuccientComment {
  id: string;
  content: string; // body
  when: string; // formatted as "Dec 4, 2023"
  replies?: SuccientComment[];
}

// Helper function to format a UNIX timestamp (in seconds) to a string like "Dec 4, 2023"
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000); // convert seconds to milliseconds
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  return date.toLocaleDateString('en-US', options);
}

// Transformation function: takes a Comment and returns a ReadableComment
export function getSuccientComment(comment: Snoowrap.Comment): SuccientComment {
  const replies = comment.replies.map((child) => getSuccientComment(child));
  return {
    id: comment.id,
    content: comment.body,
    when: formatDate(comment.created_utc),
    replies: replies.length > 0 ? replies : undefined,
  };
}

export function createSnoowrapInstance({
  clientId = process.env.REDDIT_CLIENT_ID,
  clientSecret = process.env.REDDIT_CLIENT_SECRET,
  username = process.env.REDDIT_USERNAME,
  password = process.env.REDDIT_PASSWORD,
}: {
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
}) {
  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Missing required environment variables');
  }
  return new Snoowrap({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    clientId,
    clientSecret,
    username,
    password,
  });
}
