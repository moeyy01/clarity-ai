import { OpenAIStream } from "@/utils/answer";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
// import requestIp from "request-ip";
export const localKey = process.env.OPENAI_API_KEY || ""
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
})

// const ratelimit_min = new Ratelimit({
//   redis: redis,
//   limiter: Ratelimit.fixedWindow(1, "1 m"),
//   analytics: false,
// });

const ratelimit_day = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.fixedWindow(10, "12 h"),
  analytics: false,
});

export const config = {
  runtime: "edge"
};

const handler = async (req: Request, res: Response): Promise<Response> => {
  const ipIdentifier = req.headers.get('x-real-cdn-ip') ?? req.headers.get('x-real-ip')
  // const result_min = await ratelimit_min.limit(`ai-search_min${ipIdentifier}`);
  const result_day = await ratelimit_day.limit(`ai-search_day${ipIdentifier}`);

  // if (!result_min.success) {
  //   return new Response("Error: 搜索过快，请等待1分钟。", { status: 200 });
  // }

  if (!result_day.success) {
    return new Response("Error: 今天的搜索次数达到上限。", { status: 200 });
  }

  try {
    const { prompt, apiKey } = (await req.json()) as {
      prompt: string;
      apiKey: string;
    };
    const stream = await OpenAIStream(prompt, process.env.OPENAI_API_KEY ?? req.headers.get('open-key') ?? "");

    return new Response(stream);
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
};

export default handler;
