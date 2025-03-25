import {
  BingSearchUdf,
  ChatModel,
  DuckduckgoSearchUdf,
} from '@runparse/agent-script';
import { setup } from '@runparse/agent-script-instrumentation';
import {
  WebAgent,
  WebAgentDefaultUdfs,
  createTSchemaFromInstance,
} from '@runparse/agent-script-web';
import { chromium } from 'playwright';

setup();

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const task = 'give me the top 20 posts on hacker news';
  const schema = createTSchemaFromInstance({
    title: 'title of the article',
    author: 'author of the article',
    points: 0,
  });

  const agent = new WebAgent({
    name: 'Web Agent',
    description: '',
    maxSteps: 10,
    page,
    dataObjectSchema: schema,
    shouldRunPlanning: true,
    model: new ChatModel({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4096,
    }),
    udfs: [
      ...WebAgentDefaultUdfs.filter((udf) => !(udf instanceof BingSearchUdf)),
      new DuckduckgoSearchUdf(),
    ],
  });

  await agent.run(task, {});
  await page.close();
  await browser.close();

  console.log('data:\n', agent.getDatasheetEntries());
}

main().catch(console.error);
