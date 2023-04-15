import { OpenAIStream } from "@/utils/answer";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import requestIp from "request-ip";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
})

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.fixedWindow(1, "1 m"),
  analytics: false,
});


export const config = {
  runtime: "edge"
};

const handler = async (req, res): Promise<Response> => {
  const ipIdentifier = req.headers.get('x-real-cdn-ip') ?? requestIp.getClientIp(req)
  const result = await ratelimit.limit(`ai-search_${ipIdentifier}`);
  res.headers.set('X-RateLimit-Limit', result.limit.toString())
  res.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  res.headers.set('X-Reques-IP', ipIdentifier || '?')

  if (!result.success) {
    return new Response("搜索过快，请等待片刻。", { status: 429 });
  }
  try {
    const { prompt, apiKey } = (await req.json()) as {
      prompt: string;
      apiKey: string;
    };

    const stream = await OpenAIStream(prompt, process.env.OPENAI_API_KEY ?? "");

    return new Response(stream);
  } catch (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }
};

export default handler;
