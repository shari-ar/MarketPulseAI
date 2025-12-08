const assert = require("assert");
const { describe, it } = require("node:test");

const topBoxHtml = `
<div id="MainBox">
  <div class="header bigheader"><span>بانک ملت</span> (<span>وبملت</span>)  - <span>بازار اول (تابلوی اصلی) بورس</span></div>
</div>
<div id="TopBox">
  <div id="divSupervision"></div>
  <div class="box2 zi1">
    <div class="box6 h80">
      <table><tbody>
        <tr><td>آخرین معامله</td><td id="d02"><div><div>3,566</div></div></td></tr>
        <tr><td>قیمت پایانی</td><td id="d03"><div><div>3,549</div></div></td></tr>
        <tr><td>اولین قیمت</td><td id="d04"><div><div>3,507</div></div></td></tr>
      </tbody></table>
    </div>
    <div class="box6 h80">
      <table><tbody>
        <tr><td>بازه روز</td><td><div><div>3,595</div></div></td><td><div><div>3,507</div></div></td></tr>
        <tr><td>قیمت مجاز</td><td id="PRange1"><div><div>3,678</div></div></td><td id="PRange2"><div><div>3,464</div></div></td></tr>
      </tbody></table>
    </div>
    <div class="box6 h80">
      <table><tbody>
        <tr><td>تعداد معاملات</td><td id="d08"><div><div>1,421</div></div></td></tr>
        <tr><td>حجم معاملات</td><td id="d09"><div><div class="ltr inline" title="7,799,903">7.8 M</div></div></td></tr>
        <tr><td>ارزش معاملات</td><td id="d10"><div><div class="ltr inline" title="27,679,973,416">27.68 B </div></div></td></tr>
        <tr><td>ارزش بازار</td><td id="d11"><div class="ltr inline" title="35,490,000,000,000">35,490 B </div></td></tr>
      </tbody></table>
    </div>
    <div class="box6 h80">
      <table><tbody>
        <tr><td>تعداد سهام</td><td><div class="ltr inline" title="10,000,000,000">10 B </div></td></tr>
        <tr><td>حجم مبنا</td><td><div class="ltr inline" title="4,096,123">4.096 M</div></td></tr>
        <tr><td>سهام شناور</td><td>%</td></tr>
        <tr><td>میانگین حجم ماه</td><td><div class="ltr inline" title="26,163,963">26.164 M</div></td></tr>
      </tbody></table>
    </div>
    <div class="box6 h40">
      <table><tbody>
        <tr><td>آخرین اطلاعات قیمت</td><td id="d00"><div><div>10:58:16</div></div></td></tr>
        <tr><td>وضعیت</td><td id="d01">مجاز</td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="box2 zi2">
    <div class="box6">
      <table><tbody>
        <tr><td>حجم</td><td>خرید</td><td>فروش</td></tr>
        <tr><td>حقیقی</td><td id="e0"><div><div class="ltr inline" title="4,608,459">4.608 M</div></div></td><td id="e3"><div><div class="ltr inline" title="4,849,394">4.849 M</div></div></td></tr>
        <tr><td>حقوقی</td><td id="e1"><div><div class="ltr inline" title="3,191,444">3.191 M</div></div></td><td id="e4"><div><div class="ltr inline" title="2,950,509">2.951 M</div></div></td></tr>
        <tr><td>تعداد</td><td>خرید</td><td>فروش</td></tr>
        <tr><td>مجموع</td><td><div><div>103</div></div></td><td><div><div>1,116</div></div></td></tr>
        <tr><td>حقیقی</td><td><div><div>98</div></div></td><td><div><div>1,114</div></div></td></tr>
        <tr><td>حقوقی</td><td><div><div>5</div></div></td><td><div><div>2</div></div></td></tr>
      </tbody></table>
    </div>
  </div>
</div>
`;

describe("TopBox extraction", () => {
  it("parses all required fields from TopBox HTML", async () => {
    const { extractTopBoxSnapshotFromPage } = await import("../extension/parsing/price.js");

    const snapshot = extractTopBoxSnapshotFromPage(topBoxHtml);

    assert.deepStrictEqual(snapshot, {
      symbolName: "بانک ملت",
      symbolAbbreviation: "وبملت",
      lastTrade: 3566,
      closingPrice: 3549,
      firstPrice: 3507,
      tradesCount: 1421,
      tradingVolume: 7799903,
      tradingValue: 27679973416,
      marketValue: 35490000000000,
      lastPriceTime: "10:58:16",
      status: "مجاز",
      dailyLowRange: 3507,
      dailyHighRange: 3595,
      allowedLowPrice: 3464,
      allowedHighPrice: 3678,
      shareCount: 10000000000,
      baseVolume: 4096123,
      floatingShares: null,
      averageMonthlyVolume: 26163963,
      realBuyVolume: 4608459,
      realSellVolume: 4849394,
      legalBuyVolume: 3191444,
      legalSellVolume: 2950509,
      totalBuyVolume: 7799903,
      totalSellVolume: 7799903,
      realBuyCount: 98,
      realSellCount: 1114,
      legalBuyCount: 5,
      legalSellCount: 2,
      totalBuyCount: 103,
      totalSellCount: 1116,
    });
  });

  it("returns null when no TopBox data is present", async () => {
    const { extractTopBoxSnapshotFromPage } = await import("../extension/parsing/price.js");
    assert.strictEqual(extractTopBoxSnapshotFromPage("<html><body></body></html>"), null);
  });

  it("uses the first number when multiple values appear in price cells", async () => {
    const { extractTopBoxSnapshotFromPage } = await import("../extension/parsing/price.js");
    const htmlWithExtras = `
      <div id="TopBox">
        <table><tbody>
          <tr><td>آخرین معامله</td><td id="d02"><div><div>26,650  750 [2.9%]</div></div></td></tr>
          <tr><td>قیمت پایانی</td><td id="d03"><div><div>26,400  500 [1.8%]</div></div></td></tr>
        </tbody></table>
      </div>
    `;

    const snapshot = extractTopBoxSnapshotFromPage(htmlWithExtras);

    assert(snapshot);
    assert.strictEqual(snapshot.lastTrade, 26650);
    assert.strictEqual(snapshot.closingPrice, 26400);
  });
});
