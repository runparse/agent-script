import { ChatModel } from '@runparse/agent-script';
import { setup } from '@runparse/agent-script-instrumentation';
import {
  WebDataAgent,
  getWebDataAgentDefaultUdfs,
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

  try {
    const agent = new WebDataAgent({
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
        ...getWebDataAgentDefaultUdfs({
          useBingSearch: false,
          extractionObjectSchema: schema,
        }),
      ],
    });

    await agent.run(task, {});
    await page.close();
    await browser.close();

    console.log('data:\n', agent.getDatasheetEntries());
  } catch (error) {
    console.error(error);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch(console.error);
