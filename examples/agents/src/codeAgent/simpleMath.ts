// import { ChatModel } from '@runparse/agent-script';
import { CodeAgent, FinalAnswerUdf } from '@runparse/agent-script';
import { setup } from '@runparse/agent-script-instrumentation';

setup();

async function main() {
  const task = 'what is 2 + 2?';

  try {
    const agent = new CodeAgent({
      name: 'Web Agent',
      description: '',
      maxSteps: 10,
      udfs: [new FinalAnswerUdf()],
      // uncomment to use anthropic, must set ANTHROPIC_API_KEY in .env
      // model: new ChatModel({
      //   provider: 'anthropic',
      //   model: 'claude-3-5-sonnet-latest',
      //   max_tokens: 4096,
      // }),
    });

    const finalAnswer = await agent.run(task, {});

    console.log('final answer:\n', finalAnswer);
  } catch (error) {
    console.error(error);
  }
}

main().catch(console.error);
