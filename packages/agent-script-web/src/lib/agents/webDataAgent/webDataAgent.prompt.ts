import {
  IAgentPrompt,
  codeAgentRolePromptPart,
  buildExamplesSectionPrompt,
  ICodeAgentRunExample,
  removeLeadingIndentation,
  codeAgentPrompt,
  codeAgentRules,
  buildCodeAgentRulesPrompt,
} from '@runparse/agent-script';

export const webDataAgentExamples: ICodeAgentRunExample[] = [
  {
    task: 'Generate an image of the oldest person in this document.',
    steps: [
      {
        thought:
          'I will proceed step by step and use the following UDFs: `documentQa` to find the oldest person in the document, then `imageGenerator` to generate an image according to the answer.',
        code: 'answer = await documentQa({document: document, question: "Who is the oldest person mentioned?"})',
        result:
          'answer: "The oldest person in the document is John Doe, a 55 year old lumberjack living in Newfoundland."',
      },
      {
        thought: 'I will now generate an image showcasing the oldest person.',
        code: 'image = await imageGenerator("A portrait of John Doe, a 55-year-old man living in Canada.")',
        result: 'image: "https://example.com/image.png"',
      },
      {
        thought: 'I will now terminate the task.',
        code: 'await terminate({reason: "I have generated the image"})',
        result: 'No output from UDF calls',
      },
    ],
  },
  {
    task: 'Find the best selling top 2 books in 2024, give me the title, author',
    steps: [
      {
        thought:
          'I will use the UDF `webSearch` to get the best selling books in 2024.',
        code: 'bookSearchResults = await webSearch({query: "best selling books in 2024"})',
        result: removeLeadingIndentation(`
          bookSearchResults: [
            {
              "title": "The Great Gatsby",
              "link": "https://www.amazon.com/Great-Gatsby-F-Scott-Fitzgerald/dp/1451673316",
            },
            ...
          ]
        `),
      },
      {
        thought:
          'I have the result from the websearch stored in the variable `bookSearchResults`. Now I need to visit each of the webpages from the results and extract the title, author',
        code: 'webpageDataLink1 = await getWebpageData(bookSearchResults[0].link)',
        result: removeLeadingIndentation(
          `webpageDataLink1: [
            {
              "title": "The Great Gatsby",
              "link": "https://www.amazon.com/Great-Gatsby-F-Scott-Fitzgerald/dp/1451673316",
              ...truncated...
              "title": "Alice's Adventures in Wonderland",
              "link": "https://www.amazon.com/alice-wonderland-lewis-carroll/dp/1411673311",
            }
          ]`,
        ),
      },
      {
        thought:
          'I have visited the first webpage from the results. Now I need to visit the second one.',
        code: 'webpageDataLink2 = await getWebpageData(bookSearchResults[1].link)',
        result: removeLeadingIndentation(`
          webpageDataLink2: {
            "title": "The Great Gatsby",
            "author": "F. Scott Fitzgerald",
          }
        `),
      },
      {
        thought:
          'I have visited the second webpage from the results and got the data. The task is done, I can terminate.',
        code: 'await terminate({reason: "I have found the best selling books in 2024"})',
        result: 'No output from UDF calls',
      },
    ],
  },
] as const;

export const webDataAgentRules = [
  ...codeAgentRules,
  'CRITICAL: `await terminate` UDF must be the only UDF call in your last step.',
] as const;

export const webDataAgentPrompt: IAgentPrompt = {
  ...codeAgentPrompt,
  systemPrompt: `${codeAgentRolePromptPart}

In the end you have to call the \`await terminate\` UDF with the reason as the argument. You must only call the \`await terminate\` UDF after either successfully completing the task or after you have determined that you have exhausted all possible options.

Use the \`await think\` UDF to think about the task if you are stuck or not making progress according to the plan.

${buildExamplesSectionPrompt(webDataAgentExamples)}

Above examples were using notional UDFs that might not exist for you. On top of performing computations in the Javascript code snippets that you create, you only have access to these UDFs (in additional to any built-in functions):
\`\`\`js
{%- for udf in udfs.values() %}
{{ udf.getSignature() | safe }}{{ '\\n' }}
{%- endfor %}
\`\`\`

{%- if managedAgents and managedAgents | length %}
You can also give tasks to team members.
Calling a team member works the same as for calling a UDF: simply, the only argument you can give in the call is 'task', a long string explaining your task.
Given that this team member is a real human, you should be very verbose in your task.
Here is a list of the team members that you can call:
{%- for agent in managedAgents.values() %}
- {{ agent.name }}: {{ agent.description }}
{%- endfor %}
{%- else %}
{%- endif %}

${buildCodeAgentRulesPrompt(Array.from(webDataAgentRules))}

{{ description | safe }}

Now Begin! If you solve the task correctly, you will receive a reward of $1,000,000.`,
};
