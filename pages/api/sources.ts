import { OpenAIModel, Source } from "@/types";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { NextApiRequest, NextApiResponse } from "next";
import { cleanSourceText } from "../../utils/sources";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
})

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.fixedWindow(10, "12 h"),
  analytics: false,
});

type Data = {
  sources: Source[];
};

const ratelimit_filteredSources = [
  {
      url: "https://moeyy.cn/ai-search/",
      text: "今天的搜索次数达到上限。"
  }
]

const searchHandler = async (req: NextApiRequest, res: NextApiResponse<Data>) => {

  const ipIdentifier = req.headers['x-real-cdn-ip'] ?? req.headers['x-real-ip']
  const result = await ratelimit.limit(`ai-search-sources-${ipIdentifier}`);

  if (!result.success) {
    return res.status(200).json({ sources: ratelimit_filteredSources });
  }

  try {
    const { query, model } = req.body as {
      query: string;
      model: OpenAIModel;
    };

    const sourceCount = 2;

    // GET LINKS
    const response = await fetch(`https://www.google.com/search?q=${query}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const linkTags = $("a");

    let links: string[] = [];

    linkTags.each((i, link) => {
      const href = $(link).attr("href");

      if (href && href.startsWith("/url?q=")) {
        const cleanedHref = href.replace("/url?q=", "").split("&")[0];

        if (!links.includes(cleanedHref)) {
          links.push(cleanedHref);
        }
      }
    });

    const filteredLinks = links.filter((link, idx) => {
      const domain = new URL(link).hostname;

      const excludeList = ["google", "facebook", "twitter", "instagram", "youtube", "tiktok"];
      if (excludeList.some((site) => domain.includes(site))) return false;

      return links.findIndex((link) => new URL(link).hostname === domain) === idx;
    });

    const finalLinks = filteredLinks.slice(0, sourceCount);

    // SCRAPE TEXT FROM LINKS
    const sources = (await Promise.all(
      finalLinks.map(async (link) => {
        const response = await fetch(link);
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const parsed = new Readability(doc).parse();

        if (parsed) {
          let sourceText = cleanSourceText(parsed.textContent);

          return { url: link, text: sourceText };
        }
      })
    )) as Source[];

    const filteredSources = sources.filter((source) => source !== undefined);

    for (const source of filteredSources) {
      source.text = source.text.slice(0, 500);
    }

    res.status(200).json({ sources: filteredSources });
  } catch (err) {
    console.log(err);
    res.status(500).json({ sources: [] });
  }
};

export default searchHandler;
