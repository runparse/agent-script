# Agents

Run `npm install` first
Create a `.env` file in this folder with, at a minimum

```
OPENAI_API_KEY=<your-key>
```

## CodeAgent

A general agent that solves problems by writing javascript code.

```sh
npx tsx --env-file=.env src/codeAgent/simpleMath.ts
```

## DeepResearchAgent

DeepResearchAgent is a generate agent to do research on the internet and produce answers and reports.

```sh
npx tsx --env-file=.env src/deepResearchAgent/bestSellingBooks.ts
```

Optional values are needed with different models and service providers. See run.ts comments for more.

## WebDataAgent

WebDataAgent is an agent that collects structured data from the internet through search and web page browsing.

```sh
npx tsx --env-file=.env src/webDataAgent/hackernews.ts
```

Optional values are needed with different models and service providers. See run.ts comments for more.
