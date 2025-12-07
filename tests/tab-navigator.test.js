const assert = require("assert");
const { describe, it } = require("node:test");
const { EventEmitter } = require("events");

function createFakeTabsApi() {
  let nextId = 1;
  const emitter = new EventEmitter();
  const tabs = new Map();

  return {
    tabs,
    created: [],
    updated: [],
    create: ({ url }) => {
      const tab = { id: nextId++, url };
      tabs.set(tab.id, tab);
      setTimeout(() => emitter.emit("updated", tab.id, { status: "complete" }, tab));
      return Promise.resolve(tab);
    },
    update: (tabId, { url }) => {
      const tab = tabs.get(tabId);
      if (!tab) {
        return Promise.reject(new Error("missing tab"));
      }
      tab.url = url;
      setTimeout(() => emitter.emit("updated", tab.id, { status: "complete" }, tab));
      return Promise.resolve(tab);
    },
    onUpdated: {
      addListener: (listener) => emitter.on("updated", listener),
      removeListener: (listener) => emitter.off("updated", listener),
    },
  };
}

function createFakeAlarmsApi() {
  const emitter = new EventEmitter();
  const created = [];
  const cleared = [];

  return {
    created,
    cleared,
    create: (name, info) => {
      created.push({ name, info });
    },
    clear: (name, callback) => {
      cleared.push(name);
      if (callback) callback(true);
      return Promise.resolve(true);
    },
    onAlarm: {
      addListener: (listener) => emitter.on("alarm", listener),
      removeListener: (listener) => emitter.off("alarm", listener),
    },
    emit: (name) => emitter.emit("alarm", { name }),
  };
}

describe("TabNavigator", () => {
  it("walks through symbols sequentially", async () => {
    const fakeTabs = createFakeTabsApi();
    const { TabNavigator } = await import("../extension/navigation/tabNavigator.js");

    const visited = [];
    const navigator = new TabNavigator({
      tabsApi: fakeTabs,
      delayMs: 0,
      onVisit: ({ symbol }) => visited.push(symbol),
    });

    navigator.enqueueSymbols(["AAA", "BBB", "CCC"]);
    await navigator.start();
    await navigator.whenIdle();

    assert.deepStrictEqual(visited, ["AAA", "BBB", "CCC"]);
    assert.strictEqual(navigator.running, false);
    assert.strictEqual(navigator.pendingCount, 0);
  });

  it("reuses a single tab for navigation", async () => {
    const fakeTabs = createFakeTabsApi();
    const { TabNavigator } = await import("../extension/navigation/tabNavigator.js");

    const navigator = new TabNavigator({ tabsApi: fakeTabs, delayMs: 0 });

    navigator.enqueueSymbols(["AAA", "BBB"]);
    await navigator.start();
    await navigator.whenIdle();

    assert.strictEqual(fakeTabs.tabs.size, 1);
    const [tab] = fakeTabs.tabs.values();
    assert.ok(tab.url.endsWith("BBB"));
  });

  it("stops when requested and leaves the remaining queue untouched", async () => {
    const fakeTabs = createFakeTabsApi();
    const { TabNavigator } = await import("../extension/navigation/tabNavigator.js");

    const navigator = new TabNavigator({ tabsApi: fakeTabs, delayMs: 50 });

    navigator.enqueueSymbols(["AAA", "BBB", "CCC"]);
    await navigator.start();
    navigator.stop();

    assert.ok(navigator.pendingCount >= 1);
    assert.strictEqual(navigator.running, false);
  });

  it("emits progress updates with totals and remaining counts", async () => {
    const fakeTabs = createFakeTabsApi();
    const { TabNavigator } = await import("../extension/navigation/tabNavigator.js");

    const progress = [];
    const navigator = new TabNavigator({
      tabsApi: fakeTabs,
      delayMs: 0,
      onProgress: (snapshot) => progress.push(snapshot),
    });

    navigator.enqueueSymbols(["AAA", "BBB"]);
    await navigator.start();

    navigator.enqueueSymbols(["CCC"]);
    await navigator.whenIdle();

    assert.deepStrictEqual(
      progress.map(({ symbol, completed, total, remaining }) => ({
        symbol,
        completed,
        total,
        remaining,
      })),
      [
        { symbol: "AAA", completed: 1, total: 2, remaining: 1 },
        { symbol: "BBB", completed: 2, total: 3, remaining: 1 },
        { symbol: "CCC", completed: 3, total: 3, remaining: 0 },
      ]
    );
  });

  it("routes callback failures through onError without halting the queue", async () => {
    const fakeTabs = createFakeTabsApi();
    const { TabNavigator } = await import("../extension/navigation/tabNavigator.js");

    const errors = [];
    const visited = [];
    const navigator = new TabNavigator({
      tabsApi: fakeTabs,
      delayMs: 0,
      onVisit: ({ symbol }) => {
        visited.push(symbol);
        throw new ReferenceError("alert is not defined");
      },
      onError: (error, context) => errors.push({ error, context }),
    });

    navigator.enqueueSymbols(["AAA", "BBB"]);
    await navigator.start();
    await navigator.whenIdle();

    assert.deepStrictEqual(visited, ["AAA", "BBB"]);
    assert.strictEqual(errors.length, 2);
    assert.deepStrictEqual(
      errors.map(({ error, context }) => ({
        name: error.name,
        message: error.message,
        symbol: context.symbol,
      })),
      [
        { name: "ReferenceError", message: "alert is not defined", symbol: "AAA" },
        { name: "ReferenceError", message: "alert is not defined", symbol: "BBB" },
      ]
    );
  });

  it("wakes via alarms when the service worker would otherwise idle", async () => {
    const fakeTabs = createFakeTabsApi();
    const fakeAlarms = createFakeAlarmsApi();
    const { TabNavigator } = await import("../extension/navigation/tabNavigator.js");

    const visited = [];
    const navigator = new TabNavigator({
      tabsApi: fakeTabs,
      alarmsApi: fakeAlarms,
      delayMs: 100000,
      onVisit: ({ symbol }) => visited.push(symbol),
    });

    navigator.enqueueSymbols(["AAA", "BBB"]);
    await navigator.start();

    const scheduledAlarm = fakeAlarms.created.find(Boolean);
    if (scheduledAlarm) {
      fakeAlarms.emit(scheduledAlarm.name);
    }

    await navigator.whenIdle();
    navigator.stop();

    assert.deepStrictEqual(visited, ["AAA", "BBB"]);
    assert.ok(fakeAlarms.cleared.includes(navigator._alarmName));
  });
});
