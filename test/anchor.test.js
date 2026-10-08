const test = require("node:test");
const assert = require("node:assert/strict");
const { describe: describeRange, locate, normalize, canonicalUrl } = require("../lib/anchor");

const article = [
  "Minecraftly keeps your notes in a book and quill.",
  "The quick brown fox jumps over the lazy dog near the river bank.",
  "Highlights should survive small edits to the page around them.",
  "The quick brown fox jumps over the lazy dog near the old mill.",
  "Nothing else of note happens in this short paragraph.",
].join("\n\n");

const range = (text, phrase, nth = 0) => {
  let at = -1;
  for (let i = 0; i <= nth; i += 1) at = text.indexOf(phrase, at + 1);
  assert.notEqual(at, -1, `"${phrase}" not in text`);
  return [at, at + phrase.length];
};

test("finds an unchanged highlight exactly", () => {
  const selector = describeRange(article, ...range(article, "survive small edits"));
  const found = locate(article, selector);
  assert.equal(found.status, "anchored");
  assert.equal(article.slice(found.start, found.end), "survive small edits");
  assert.equal(found.confidence, 1);
});

test("picks the right one of two identical phrases using context", () => {
  const phrase = "The quick brown fox jumps over the lazy dog";
  const selector = describeRange(article, ...range(article, phrase, 1));
  const found = locate(article, selector);
  assert.equal(found.status, "anchored");
  assert.equal(found.start, range(article, phrase, 1)[0]);
});

test("still picks the right twin after text is inserted above it", () => {
  const phrase = "The quick brown fox jumps over the lazy dog";
  const selector = describeRange(article, ...range(article, phrase, 1));
  const edited = `A brand new introduction paragraph was added at the top.\n\n${article}`;
  const found = locate(edited, selector);
  assert.equal(found.status, "anchored");
  assert.equal(edited.slice(found.end, found.end + 18), " near the old mill");
});

test("refuses to guess between identical phrases with identical context", () => {
  const twin = "alpha beta gamma. alpha beta gamma.";
  const found = locate(twin, { exact: "beta", prefix: "", suffix: "" });
  assert.equal(found.status, "ambiguous");
});

test("follows a small edit inside the highlight", () => {
  const selector = describeRange(article, ...range(article, "Highlights should survive small edits to the page"));
  const edited = article.replace("survive small edits", "survive tiny edits");
  const found = locate(edited, selector);
  assert.equal(found.status, "anchored");
  assert.equal(edited.slice(found.start, found.end), "Highlights should survive tiny edits to the page");
  assert.ok(found.confidence > 0.85 && found.confidence < 1);
  assert.equal(found.selector.exact, "Highlights should survive tiny edits to the page");
});

test("a reworded match snaps to whole words like the original selection", () => {
  const text = "Fishermen say the finest trout are caught at dawn, just below the old stone bridge.";
  const selector = describeRange(text, ...range(text, "finest trout are caught at dawn"));
  const edited = text.replace("finest", "best");
  const found = locate(edited, selector);
  assert.equal(found.status, "anchored");
  assert.equal(edited.slice(found.start, found.end), "best trout are caught at dawn");
});

test("reports not-found instead of highlighting other words when the text is gone", () => {
  const selector = describeRange(article, ...range(article, "Highlights should survive small edits"));
  const edited = article.replace("Highlights should survive small edits to the page around them.", "This sentence was rewritten entirely by someone else.");
  assert.equal(locate(edited, selector).status, "not-found");
});

test("ignores whitespace, non-breaking spaces and invisible characters", () => {
  const selector = describeRange(article, ...range(article, "book and quill"));
  const messy = article.replace("book and quill", "book  and\n\tqu­ill");
  const found = locate(messy, selector);
  assert.equal(found.status, "anchored");
  assert.equal(normalize(messy.slice(found.start, found.end)).text, "book and quill");
});

test("strict mode (weak source identity) never fuzzes", () => {
  const selector = describeRange(article, ...range(article, "survive small edits"));
  const edited = article.replace("survive small edits", "survive tiny edits");
  assert.equal(locate(edited, selector, { strict: true }).status, "not-found");
});

test("fuzzy search stays fast on a long page", () => {
  const filler = Array.from({ length: 20000 }, (_, i) => `Sentence number ${i} talks about nothing much.`).join(" ");
  const page = `${filler} The secret phrase lives right here in the middle. ${filler}`;
  const selector = describeRange(page, ...range(page, "The secret phrase lives right here"));
  const edited = page.replace("secret phrase", "secret phrases");
  const started = performance.now();
  const found = locate(edited, { exact: selector.exact, prefix: selector.prefix, suffix: selector.suffix });
  const took = performance.now() - started;
  assert.equal(found.status, "anchored");
  assert.ok(took < 1500, `took ${Math.round(took)} ms`);
});

test("canonical URLs ignore fragments and tracking parameters", () => {
  assert.equal(
    canonicalUrl("https://Example.com/post/?utm_source=x&b=2&a=1#comments"),
    canonicalUrl("https://example.com/post?a=1&b=2&fbclid=abc"),
  );
  assert.notEqual(canonicalUrl("https://example.com/post?id=1"), canonicalUrl("https://example.com/post?id=2"));
});
