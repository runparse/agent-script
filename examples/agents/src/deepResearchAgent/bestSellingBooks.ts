// import { ChatModel } from '@runparse/agent-script';
import { setup } from '@runparse/agent-script-instrumentation';
import {
  DeepResearchAgent,
  getDeepResearchAgentDefaultUdfs,
} from '@runparse/agent-script-web';
import { chromium } from 'playwright';

setup();

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const task = 'What are the best selling books in 2025?';

  try {
    const agent = new DeepResearchAgent({
      name: 'Web Agent',
      description: '',
      maxSteps: 10,
      page,
      udfs: getDeepResearchAgentDefaultUdfs({ useBingSearch: false }), // set to true to use bing, must set BING_API_KEY in .env
      // uncomment to use anthropic, must set ANTHROPIC_API_KEY in .env
      // model: new ChatModel({
      //   provider: 'anthropic',
      //   model: 'claude-3-5-sonnet-latest',
      //   max_tokens: 4096,
      // }),
    });

    const finalAnswer = await agent.run(task, {});
    await page.close();
    await browser.close();

    console.log('finalAnswer:\n', finalAnswer);
  } catch (error) {
    console.error(error);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch(console.error);
