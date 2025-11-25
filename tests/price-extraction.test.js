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

const topBoxHtml = `
<div id="TopBox">
  <div class="box2 zi1">
    <div class="box6 h80">
      <table><tbody>
        <tr><td>آخرین معامله</td><td id="d02"><div><div>19,070&nbsp;&nbsp;<span>550</span></div></div></td></tr>
        <td>قیمت پایانی</td><td id="d03"><div><div>19,070&nbsp;&nbsp;<span>550</span></div></div></td>
        <tr><td>اولین قیمت</td><td id="d04"><div><div>19,070</div></div></td></tr>
        <tr><td>قیمت دیروز</td><td id="d05"><div><div>18,520</div></div></td></tr>
      </tbody></table>
    </div>
    <div class="box6 h80">
      <table><tbody>
        <tr><td>بازه روز</td><td><div><div>18,900</div></div></td><td><div><div>19,200</div></div></td></tr>
      </tbody></table>
    </div>
  </div>
</div>
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

  it("scrapes TopBox HTML when Next.js data is absent", async () => {
    const { extractPriceInfoFromPage } = await import("../extension/parsing/price.js");

    const result = extractPriceInfoFromPage(topBoxHtml);

    assert.deepStrictEqual(result, {
      open: 19070,
      high: 19200,
      low: 18900,
      close: 19070,
      last: 19070,
    });
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
});
