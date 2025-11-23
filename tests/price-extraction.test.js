const assert = require("assert");
const { describe, it } = require("node:test");

const htmlTemplate = (pricePayload) => `
<!DOCTYPE html>
<html>
  <head>
    <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify(pricePayload)}
    </script>
  </head>
  <body></body>
</html>
`;

describe("price extraction", () => {
  it("pulls OHLC values from embedded Next.js data", async () => {
    const { extractPriceInfoFromPage } = await import("../extension/parsing/price.js");

    const html = htmlTemplate({
      props: {
        pageProps: {
          instrument: {
            priceInfo: {
              open: "12,300",
              high: 12500,
              low: "12,100",
              close: "12,450",
              last: "12,500",
            },
          },
        },
      },
    });

    const result = extractPriceInfoFromPage(html);

    assert.deepStrictEqual(result, {
      open: 12300,
      high: 12500,
      low: 12100,
      close: 12450,
      last: 12500,
    });
  });

  it("parses raw __NEXT_DATA__ JSON without markup", async () => {
    const { extractPriceInfoFromPage } = await import("../extension/parsing/price.js");

    const rawJson = JSON.stringify({
      props: {
        pageProps: {
          instrument: {
            priceInfo: {
              open: 9000,
              high: 9900,
              low: 8800,
              close: 9500,
              last: 9520,
            },
          },
        },
      },
    });

    const result = extractPriceInfoFromPage(rawJson);

    assert.deepStrictEqual(result, {
      open: 9000,
      high: 9900,
      low: 8800,
      close: 9500,
      last: 9520,
    });
  });

  it("falls back to alternative price fields when standard keys are missing", async () => {
    const { extractPriceInfoFromPage } = await import("../extension/parsing/price.js");

    const html = htmlTemplate({
      props: {
        pageProps: {
          instrumentInfo: {
            closingPriceInfo: {
              priceYesterday: "10,000",
              priceMax: "10,800",
              priceMin: "9,700",
              finalPrice: "10,300",
              lastPrice: "10,450",
            },
          },
        },
      },
    });

    const result = extractPriceInfoFromPage(html);

    assert.deepStrictEqual(result, {
      open: 10000,
      high: 10800,
      low: 9700,
      close: 10300,
      last: 10450,
    });
  });

  it("returns null for pages without usable price data", async () => {
    const { extractPriceInfoFromPage } = await import("../extension/parsing/price.js");

    const html = htmlTemplate({ props: { pageProps: { foo: "bar" } } });
    const result = extractPriceInfoFromPage(html);

    assert.strictEqual(result, null);
  });

  it("ignores empty string price values instead of coercing to zero", async () => {
    const { extractPriceInfoFromPage } = await import("../extension/parsing/price.js");

    const html = htmlTemplate({
      props: {
        pageProps: {
          instrument: {
            priceInfo: {
              open: " ",
              high: "",
              low: "",
              close: "",
              last: null,
            },
          },
        },
      },
    });

    const result = extractPriceInfoFromPage(html);

    assert.strictEqual(result, null);
  });

  it("falls back to DOM selector when Next.js data is unavailable", async () => {
    const { extractPriceInfoFromDom, extractPriceInfoFromPage } = await import(
      "../extension/parsing/price.js"
    );

    const fakeDocument = {
      querySelector: (selector) => {
        if (
          selector ===
          "body > div > div > div:nth-child(2) > div:nth-child(3) > div:nth-child(3) > div:nth-child(1) > div:nth-child(2)"
        ) {
          return { textContent: "98,765" };
        }
        return null;
      },
    };

    const extractedDirect = extractPriceInfoFromDom(fakeDocument);

    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument;
    const extractedViaPageHelper = extractPriceInfoFromPage("<html><body></body></html>");
    globalThis.document = originalDocument;

    const expected = {
      open: null,
      high: null,
      low: null,
      close: null,
      last: 98765,
    };

    assert.deepStrictEqual(extractedDirect, expected);
    assert.deepStrictEqual(extractedViaPageHelper, expected);
  });
});
