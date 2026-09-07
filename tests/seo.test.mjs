import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const origin = "https://haavelund.no";

const pages = [
  { file: "index.html", canonical: `${origin}/`, locale: "nb_NO", type: "website" },
  { file: "fortelle.html", canonical: `${origin}/fortelle.html`, locale: "nb_NO", type: "website" },
  { file: "sausank.html", canonical: `${origin}/sausank.html`, locale: "nb_NO", type: "website" },
  { file: "bremselengder.html", canonical: `${origin}/bremselengder.html`, locale: "nb_NO", type: "website" },
  { file: "TilKalender.html", canonical: `${origin}/TilKalender.html`, locale: "nb_NO", type: "website" },
  { file: "ToCalendar.html", canonical: `${origin}/ToCalendar.html`, locale: "en_US", type: "website" },
];

const utilityPages = [
  { file: "404.html", canonical: `${origin}/404.html` },
  { file: "bremselengder-privacy.html", canonical: `${origin}/bremselengder-privacy.html` },
  { file: "profeten-privacy.html", canonical: `${origin}/profeten-privacy.html` },
  { file: "tocalendar/privacy.html", canonical: `${origin}/tocalendar/privacy.html` },
];

// Omdirigeringsstubber skal bare omdirigere. Google behandler «refresh 0» som en
// permanent viderekobling, men noindex kan hindre at den prosesseres, og en
// canonical er overflodig nar malet allerede er utpekt av omdirigeringen.
const redirectPages = [
  { file: "sausank/privacy.html", target: "https://sausank.no/personvern" },
  { file: "tocalendar/index.html", target: "../ToCalendar.html" },
];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function head(html) {
  return html.match(/<head>[\s\S]*?<\/head>/i)?.[0] ?? "";
}

function attribute(html, selector, attributeName) {
  const tag = html.match(selector)?.[0] ?? "";
  return tag.match(new RegExp(`${attributeName}=["']([^"']+)["']`, "i"))?.[1];
}

function metaContent(html, attributeName, attributeValue) {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) =>
    new RegExp(`${attributeName}=["']${attributeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(candidate),
  );
  return tag?.match(/content=["']([^"']+)["']/i)?.[1];
}

function jsonLd(html) {
  const scripts = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  return scripts.map((match) => JSON.parse(match[1]));
}

for (const page of pages) {
  test(`${page.file} has complete, canonical social and search metadata`, () => {
    const html = read(page.file);
    const documentHead = head(html);
    const title = documentHead.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    const description = metaContent(documentHead, "name", "description");
    const canonical = attribute(documentHead, /<link\s+[^>]*rel=["']canonical["'][^>]*>/i, "href");

    assert.ok(title && title.length >= 20 && title.length <= 65, "title must be descriptive and concise");
    assert.ok(description && description.length >= 70 && description.length <= 180, "description must be useful and concise");
    assert.equal(canonical, page.canonical);
    assert.match(metaContent(documentHead, "name", "robots") ?? "", /\bindex\b.*\bfollow\b/);
    assert.equal(metaContent(documentHead, "property", "og:title"), title);
    assert.equal(metaContent(documentHead, "property", "og:description"), description);
    assert.equal(metaContent(documentHead, "property", "og:url"), page.canonical);
    assert.equal(metaContent(documentHead, "property", "og:type"), page.type);
    assert.equal(metaContent(documentHead, "property", "og:locale"), page.locale);
    assert.match(metaContent(documentHead, "property", "og:image") ?? "", /^https:\/\/.+/);
    assert.equal(metaContent(documentHead, "name", "twitter:card"), "summary_large_image");
    assert.equal(metaContent(documentHead, "name", "twitter:title"), title);
    assert.equal(metaContent(documentHead, "name", "twitter:description"), description);
    assert.doesNotThrow(() => jsonLd(documentHead));
    assert.ok(jsonLd(documentHead).length > 0, "page must contain JSON-LD");
  });
}

test("the home page describes the linked portfolio with structured data", () => {
  const data = jsonLd(read("index.html")).flatMap((entry) => entry["@graph"] ?? [entry]);
  const person = data.find((entry) => entry["@type"] === "Person");
  const portfolio = data.find((entry) => entry["@type"] === "ItemList");
  const expectedNames = [
    "SFO-tracker", "Fortelle", "Matte", "SauSank", "RBKNytt.no", "NerdeNytt.no", "AIssue",
    "SVG Dot Editor", "TilKalender", "Bremselengder", "Jolv", "PongGPT", "Ordel", "Astronaut",
    "AI Debate", "copyfc", "video-playback-speed", "Console Copy", "Claude Session Starter",
  ];

  assert.equal(person?.name, "Markus Haave Lund");
  assert.equal(person?.url, `${origin}/`);
  assert.equal(portfolio?.itemListElement?.length, 19, "all unique linked apps and services should be represented");
  assert.deepEqual(portfolio.itemListElement.map((entry) => entry.item.name), expectedNames);
  for (const item of portfolio.itemListElement) {
    assert.ok(item.position);
    assert.ok(item.item?.name);
    assert.match(item.item?.url ?? "", /^https:\/\//);
  }
});

test("titles, descriptions, and canonicals are unique across indexable pages", () => {
  const metadata = pages.map(({ file }) => {
    const documentHead = head(read(file));
    return {
      title: documentHead.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim(),
      description: metaContent(documentHead, "name", "description"),
      canonical: attribute(documentHead, /<link\s+[^>]*rel=["']canonical["'][^>]*>/i, "href"),
    };
  });

  for (const field of ["title", "description", "canonical"]) {
    assert.equal(new Set(metadata.map((entry) => entry[field])).size, pages.length, `${field} values must be unique`);
  }
});

test("every local page link and resource points to an existing file", () => {
  const htmlFiles = [...pages, ...utilityPages, ...redirectPages].map((page) => page.file);

  for (const file of htmlFiles) {
    const pageUrl = new URL(`../${file}`, import.meta.url);
    const references = [...read(file).matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);
    for (const reference of references) {
      if (/^(?:[a-z]+:|#)/i.test(reference)) continue;
      const [path] = reference.split("#");
      if (!path) continue;
      const localUrl = path.startsWith("/")
        ? new URL(`..${path}`, import.meta.url)
        : new URL(path, pageUrl);
      assert.ok(existsSync(localUrl), `${file} references missing local file ${reference}`);
    }
  }
});

for (const file of ["fortelle.html", "sausank.html", "bremselengder.html", "TilKalender.html", "ToCalendar.html"]) {
  test(`${file} identifies the featured app in structured data`, () => {
    const data = jsonLd(read(file)).flatMap((entry) => entry["@graph"] ?? [entry]);
    assert.ok(
      data.some((entry) => ["SoftwareApplication", "MobileApplication", "WebApplication"].flat().some((type) => [entry["@type"]].flat().includes(type))),
      "expected SoftwareApplication, MobileApplication or WebApplication JSON-LD",
    );
  });
}

test("localized ToCalendar pages are connected with reciprocal hreflang links", () => {
  for (const file of ["TilKalender.html", "ToCalendar.html"]) {
    const documentHead = head(read(file));
    assert.match(documentHead, /hreflang=["']nb-NO["'][^>]*href=["']https:\/\/haavelund\.no\/TilKalender\.html["']/i);
    assert.match(documentHead, /hreflang=["']en["'][^>]*href=["']https:\/\/haavelund\.no\/ToCalendar\.html["']/i);
    assert.match(documentHead, /hreflang=["']x-default["'][^>]*href=["']https:\/\/haavelund\.no\/TilKalender\.html["']/i);
  }
});

for (const page of utilityPages) {
  test(`${page.file} is canonical but excluded from search results`, () => {
    const documentHead = head(read(page.file));
    assert.match(metaContent(documentHead, "name", "robots") ?? "", /\bnoindex\b.*\bfollow\b/);
    assert.equal(attribute(documentHead, /<link\s+[^>]*rel=["']canonical["'][^>]*>/i, "href"), page.canonical);
  });
}

test("robots.txt permits crawling and advertises the sitemap", () => {
  const robots = read("robots.txt");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/haavelund\.no\/sitemap\.xml$/m);
});

test("sitemap.xml contains every canonical indexable page and no redirect", () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, pages.map((page) => page.canonical));
  assert.doesNotMatch(sitemap, /sausank\/privacy\.html/);
  assert.equal([...sitemap.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length, pages.length);
});

for (const page of redirectPages) {
  test(`${page.file} redirects cleanly, without competing signals`, () => {
    const html = read(page.file);
    const documentHead = head(html);
    assert.equal(metaContent(documentHead, "http-equiv", "refresh"), `0; url=${page.target}`);
    assert.ok(html.includes(`window.location.replace("${page.target}")`), "redirect must also work without meta refresh");
    assert.ok(html.includes(`<a href="${page.target}">`), "a redirect stub must still offer a crawlable link");
    assert.equal(metaContent(documentHead, "name", "robots"), undefined, "noindex can stop the redirect being processed");
    assert.equal(attribute(documentHead, /<link\s+[^>]*rel=["']canonical["'][^>]*>/i, "href"), undefined);
  });
}

test("no indexable page is orphaned from internal linking", () => {
  const linkGraph = new Map(pages.map(({ file }) => [file, read(file)]));
  const targets = pages.map(({ file }) => file).filter((file) => file !== "index.html");

  for (const target of targets) {
    const inbound = [...linkGraph].filter(([file, html]) => file !== target && html.includes(`href="${target}"`));
    assert.ok(inbound.length > 0, `${target} needs at least one inbound internal link`);
  }
});
