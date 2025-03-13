console.log("Hello from the background!");

const DEFAULT_METHODS = [
  "GET",
  "PUT",
  "POST",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "PROPFIND",
  "PROPPATCH",
  "MKCOL",
  "COPY",
  "MOVE",
  "LOCK"
];

const DEFAULT_STATUS_METHODS = [
  "GET",
  "POST",
  "PUT",
  "OPTIONS",
  "PATCH",
  "PROPFIND",
  "PROPPATCH"
];

const DEFAULT_CONTEXT_MENUS = [
  { id: "test-cors", title: "Test CORS" },
  {
    id: "tutorial",
    title: "Usage Instruction"
  },
  {
    id: "overwrite-origin",
    title: "Enable Access-Control-Allow-Origin",
    type: "checkbox"
  },
  {
    id: "allow-credentials",
    title: "Enable Access-Control-Allow-Credentials",
    type: "checkbox"
  },
  {
    id: "allow-headers",
    title: "Enable Access-Control-[Allow/Expose]-Headers",
    type: "checkbox"
  },
  {
    id: "extra",
    title: "Extra Options"
  },
  {
    id: "remove-x-frame",
    title: "Remove X-Frame-Options",
    type: "checkbox",
    parentId: "extra"
  },
  {
    id: "remove-csp",
    title: 'Remove "Content-Security-Policy" Headers',
    type: "checkbox",
    parentId: "extra"
  },
  {
    title: "Append Headers to Allow Shared Array Buffer",
    type: "checkbox",
    id: "allow-shared-array-buffer",
    parentId: "extra"
  },
  {
    id: "referer",
    title: 'Add/Remove "referer" and "origin" Headers',
    parentId: "extra"
  },
  {
    id: "fix-origin",
    title: 'Add same-origin "referer" and "origin" Headers',
    type: "checkbox",
    parentId: "referer"
  },
  {
    id: "remove-referer",
    title: 'Remove "referer" and "origin" Headers',
    type: "checkbox",
    parentId: "referer"
  },
  {
    id: "unblock-initiator",
    title: `Only Unblock Request's Initiator`,
    type: "checkbox",
    parentId: "extra"
  },
  {
    id: "fake-supported-methods",
    title: "Pretend Enabled Methods are Supported by Server",
    type: "checkbox",
    parentId: "extra"
  },
  {
    id: "menu",
    title: "Access-Control-Allow-Methods Methods:",
    parentId: "extra"
  },
  {
    id: "status-code",
    title: "Overwrite 4xx Status Code For This Tab",
    parentId: "extra",
    enabled: Boolean(chrome.debugger)
  },
  {
    id: "status-code-enable",
    title: "Enable on This Tab",
    parentId: "status-code"
  },
  {
    id: "status-code-disable",
    title: "Disable on This Tab",
    parentId: "status-code"
  },
  {
    id: "status-code-methods",
    title: "Overwrite 4xx Status Code Methods",
    parentId: "extra",
    enabled: Boolean(chrome.debugger)
  }
];

const notify = (e: any) => alert(e.message || e);

const toggle = async (name: string, rule: string, value: boolean) => {
  const prefs = await chrome.storage.local.get({
    enabled: false,
    [name]: value
  });
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    prefs.enabled && prefs[name]
      ? {
          enableRulesetIds: [rule]
        }
      : {
          disableRulesetIds: [rule]
        }
  );
};

// ContextMenus
const initContextMenus = async () => {
  const prefs = await chrome.storage.local.get({
    "overwrite-origin": true,
    "allow-credentials": true,
    "allow-headers": false,
    "remove-csp": false,
    "allow-shared-array-buffer": false,
    "remove-referer": false,
    "fix-origin": false,
    "remove-x-frame": true,
    "unblock-initiator": true,
    "fake-supported-methods": true,
    methods: DEFAULT_METHODS,
    "status-code-methods": DEFAULT_STATUS_METHODS
  });

  for (const menu of DEFAULT_CONTEXT_MENUS) {
    const contextMenu: any = { contexts: ["action"], ...menu };
    if (contextMenu.type === "checkbox") {
      contextMenu["checked"] = prefs[contextMenu.id];
    }
    chrome.contextMenus.create(contextMenu, () => chrome.runtime.lastError);
  }
  for (const method of DEFAULT_METHODS) {
    if (["GET", "POST", "HEAD"].includes(method)) {
      continue;
    }
    chrome.contextMenus.create(
      {
        title: method,
        type: "checkbox",
        id: method,
        contexts: ["action"],
        checked: prefs.methods.includes(method),
        parentId: "menu"
      },
      () => chrome.runtime.lastError
    );
  }
  for (const method of DEFAULT_STATUS_METHODS) {
    chrome.contextMenus.create(
      {
        title: method,
        type: "checkbox",
        id: "status-code-methods-" + method,
        contexts: ["action"],
        checked: prefs["status-code-methods"].includes(method),
        parentId: "status-code-methods"
      },
      () => chrome.runtime.lastError
    );
  }
};

chrome.runtime.onStartup.addListener(initContextMenus);
chrome.runtime.onInstalled.addListener(initContextMenus);

const debug = async (source: any, method: any, params: any) => {
  if (method === "Fetch.requestPaused") {
    const opts: any = {
      requestId: params.requestId
    };
    const status = params.responseStatusCode;
    if (status && status >= 400 && status < 500) {
      const prefs = await chrome.storage.local.get({
        "status-code-methods": DEFAULT_STATUS_METHODS
      });
      const methods = prefs["status-code-methods"];
      const method = params.request?.method;
      if (method && methods.includes(method)) {
        opts.responseCode = 200;
        opts.responseHeaders = params.responseHeaders || [];
      }
    }

    if (chrome.debugger) {
      chrome.debugger.sendCommand(
        {
          tabId: source.tabId
        },
        "Fetch.continueResponse",
        opts
      );
    }
  }
};

chrome.contextMenus.onClicked.addListener(
  async ({ menuItemId, checked }, tab) => {
    if (
      menuItemId === "status-code-enable" ||
      menuItemId === "status-code-disable"
    ) {
      chrome.debugger.onEvent.removeListener(debug);
      chrome.debugger.onEvent.addListener(debug);

      if (menuItemId === "status-code-disable") {
        chrome.debugger.detach(
          {
            tabId: tab?.id
          },
          () => chrome.runtime.lastError
        );
        return;
      }

      const { enabled } = await chrome.storage.local.get({ enabled: false });
      if (!enabled) {
        notify("To overwrite status codes, enable the extension first");
        return;
      }

      const target = {
        tabId: tab?.id
      };
      chrome.debugger.attach(target, "1.2", () => {
        const { lastError } = chrome.runtime;
        if (lastError) {
          console.warn(lastError);
          notify(lastError.message);
        } else {
          chrome.debugger.sendCommand(target, "Fetch.enable", {
            patterns: [
              {
                requestStage: "Response"
              }
            ]
          });
        }
      });
      return;
    }

    if (
      typeof menuItemId === "string" &&
      menuItemId.startsWith("status-code-methods-")
    ) {
      const prefs = await chrome.storage.local.get({
        "status-code-methods": DEFAULT_STATUS_METHODS
      });
      const methods = new Set(prefs["status-code-methods"]);
      const method = menuItemId.replace("status-code-methods-", "");
      methods[checked ? "add" : "delete"](method);
      await chrome.storage.local.set({
        "status-code-methods": [...methods]
      });
      return;
    }

    if (menuItemId === "test-cors") {
      await chrome.tabs.create({
        url: "https://webbrowsertools.com/test-cors/"
      });
      return;
    }
    if (menuItemId === "tutorial") {
      await chrome.tabs.create({
        url: "https://www.youtube.com/watch?v=8berLeTjKDM"
      });
      return;
    }
    if (
      typeof menuItemId === "string" &&
      [
        "remove-csp",
        "allow-shared-array-buffer",
        "fix-origin",
        "remove-referer",
        "overwrite-origin",
        "remove-x-frame",
        "allow-credentials",
        "allow-headers",
        "unblock-initiator",
        "fake-supported-methods"
      ].includes(menuItemId)
    ) {
      console.log(menuItemId, checked);
      await chrome.storage.local.set({
        [menuItemId]: checked
      });
      return;
    }

    const { methods } = await chrome.storage.local.get({
      methods: DEFAULT_METHODS
    });
    if (checked) {
      methods.push(menuItemId);
    } else {
      const index = methods.indexOf(menuItemId);
      if (index !== -1) {
        methods.splice(index, 1);
      }
    }
    await chrome.storage.local.set({ methods });
  }
);

if (chrome.debugger) {
  chrome.storage.onChanged.addListener(ps => {
    if (ps.enabled) {
      chrome.debugger.getTargets(os => {
        for (const o of os.filter(
          o => o.attached && o.type === "page" && o.tabId
        )) {
          chrome.debugger.detach(
            {
              tabId: o.tabId
            },
            () => chrome.runtime.lastError
          );
        }
      });
    }
  });
}

// extra action
const extraAction: any = {
  prefs: {},
  headersReceived: {
    action: (d: any) => {
      const { responseHeaders } = d;
      for (const method of extraAction.headersReceived.methods) {
        method.action(d);
        if (method.once) {
          extraAction.headersReceived.methods.delete(method);
        }
      }
      return {
        responseHeaders
      };
    },
    methods: new Set<any>()
  },
  beforeSendHeaders: {
    action: (d: any) => {
      const { requestHeaders } = d;
      for (const method of extraAction.beforeSendHeaders.methods) {
        method.action(d);
        if (method.once) {
          extraAction.beforeSendHeaders.methods.delete(method);
        }
      }
      return {
        requestHeaders
      };
    },
    methods: new Set<any>()
  },
  install: (prefs: any) => {
    extraAction.prefs = prefs;

    const filters = ["responseHeaders"];
    if (/Firefox/.test(navigator.userAgent) === false) {
      filters.push("extraHeaders");
    }

    chrome.webRequest.onHeadersReceived.removeListener(
      extraAction.headersReceived.action
    );
    chrome.webRequest.onHeadersReceived.addListener(
      extraAction.headersReceived.action,
      {
        urls: ["<all_urls>"]
      },
      filters
    );

    chrome.webRequest.onBeforeSendHeaders.removeListener(
      extraAction.beforeSendHeaders.action
    );

    const m = ["requestHeaders"];
    if (extraAction.prefs["fix-origin"]) {
      m.push("extraHeaders");
    }
    chrome.webRequest.onBeforeSendHeaders.addListener(
      extraAction.beforeSendHeaders.action,
      {
        urls: ["<all_urls>"]
      },
      m
    );
  },
  remove: () => {
    chrome.webRequest.onHeadersReceived.removeListener(
      extraAction.headersReceived.action
    );
    chrome.webRequest.onBeforeSendHeaders.removeListener(
      extraAction.beforeSendHeaders.action
    );
  }
};

// Access-Control-Allow-Headers for OPTIONS
extraAction.beforeSendHeaders.methods.add({
  action: (d: any) => {
    if (d.method === "OPTIONS") {
      console.log("beforeSendHeaders of Options", d);
      const r = d.requestHeaders.find(
        ({ name }: { name: string }) =>
          name.toLowerCase() === "access-control-request-headers"
      );

      if (r) {
        const { requestId } = d;
        extraAction.headersReceived.methods.add({
          action: (d: any) => {
            console.log("headersReceived of Options", d);
            if (d.method === "OPTIONS" && d.requestId === requestId) {
              d.responseHeaders.push({
                name: "Access-Control-Allow-Headers",
                value: r.value
              });
            }
          },
          once: true
        });
      }
    }
  }
});

// Access-Control-Allow-Origin
{
  const redirects: any = {};
  chrome.tabs.onRemoved.addListener(tabId => delete redirects[tabId]);

  extraAction.headersReceived.methods.add({
    action: (d: any) => {
      if (extraAction.prefs["overwrite-origin"] && d.type !== "main_frame") {
        const { initiator, originUrl, responseHeaders } = d;
        let origin = "*";

        if (
          extraAction.prefs["unblock-initiator"] ||
          extraAction.prefs["allow-credentials"]
        ) {
          if (!redirects[d.tabId] || !redirects[d.tabId][d.requestId]) {
            try {
              const o = new URL(initiator || originUrl);
              origin = o.origin;
            } catch (e) {}
          }
        }
        if (d.statusCode === 301 || d.statusCode === 302) {
          redirects[d.tabId] = redirects[d.tabId] || {};
          redirects[d.tabId][d.requestId] = true;
        }

        const r = responseHeaders.find(
          ({ name }: { name: string }) =>
            name.toLowerCase() === "access-control-allow-origin"
        );

        if (r) {
          if (r.value !== "*") {
            r.value = origin;
          }
        } else {
          responseHeaders.push({
            name: "Access-Control-Allow-Origin",
            value: origin
          });
        }
      }
    }
  });
}

// Referrer and Origin
{
  extraAction.beforeSendHeaders.methods.add({
    action: (d: any) => {
      if (extraAction.prefs["fix-origin"]) {
        try {
          const o = new URL(d.url);
          d.requestHeaders.push(
            {
              name: "referer",
              value: d.url
            },
            {
              name: "origin",
              value: o.origin
            }
          );
        } catch (e) {}
      }
    }
  });
}

const core = {
  badge: async () => {
    const { enabled } = await chrome.storage.local.get({ enabled: false });
    await chrome.action.setIcon({
      path: {
        "48": enabled
          ? chrome.runtime.getURL("logo.png")
          : chrome.runtime.getURL("logo_disabled.png")
      }
    });
    await chrome.action.setTitle({
      title: enabled
        ? "Access-Control-Allow-Origin is unblocked"
        : "Disabled: Default server behavior"
    });
  },
  "overwrite-origin": async () => {
    const prefs = await chrome.storage.local.get({
      enabled: false,
      "overwrite-origin": true,
      "fake-supported-methods": true,
      methods: DEFAULT_METHODS,
      "unblock-initiator": true,
      "allow-credentials": true,
      "fix-origin": false
    });
    if (prefs.enabled && (prefs["overwrite-origin"] || prefs["fix-origin"])) {
      extraAction.install(prefs);
    } else {
      extraAction.remove();
    }
    if (prefs.enabled && prefs["overwrite-origin"]) {
      const rules = {
        removeRuleIds: [1, 2, 3],
        addRules: [
          {
            id: 1,
            priority: 1,
            action: {
              type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
              responseHeaders: [
                {
                  operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                  header: "Access-Control-Allow-Methods",
                  value:
                    prefs.methods.length === DEFAULT_METHODS.length
                      ? "*"
                      : prefs.methods.join(", ")
                }
              ]
            },
            condition: {}
          }
        ]
      };
      rules.addRules.push({
        id: 2,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          responseHeaders: [
            {
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              header: "Access-Control-Allow-Headers",
              value: "DELETE"
            }
          ]
        },
        condition: {
          requestMethods: ["options"]
        }
      });
      if (prefs["fake-supported-methods"]) {
        rules.addRules.push({
          id: 3,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            responseHeaders: [
              {
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                header: "Allow",
                value: prefs.methods.join(", ")
              }
            ]
          },
          condition: {
            requestMethods: ["options"]
          }
        });
      }
      chrome.declarativeNetRequest.updateDynamicRules(rules);
    } else {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1, 2, 3]
      });
    }
    toggle("overwrite-origin", "overwrite-origin", true);
  },
  csp: () => toggle("remove-csp", "csp", false),
  "allow-shared-array-buffer": () =>
    toggle("allow-shared-array-buffer", "allow-shared-array-buffer", false),
  "x-frame": () => toggle("remove-x-frame", "x-frame", true),
  "allow-credentials": () =>
    toggle("allow-credentials", "allow-credentials", true),
  "allow-headers": () => toggle("allow-headers", "allow-headers", false),
  referer: () => toggle("remove-referer", "referer", false)
};

const initCore = async () => {
  await core.badge();
  await core["x-frame"]();
  await core["overwrite-origin"]();
  await core["allow-credentials"]();
  await core["allow-headers"]();
  await core["referer"]();
  await core["csp"]();
  await core["allow-shared-array-buffer"]();
};
chrome.runtime.onStartup.addListener(initCore);
chrome.runtime.onInstalled.addListener(initCore);

chrome.storage.onChanged.addListener(async prefs => {
  if (prefs.enabled) {
    await core.badge();
  }
  if (prefs.enabled || prefs["remove-x-frame"]) {
    await core["x-frame"]();
  }
  if (
    prefs.enabled ||
    prefs["overwrite-origin"] ||
    prefs.methods ||
    prefs["allow-credentials"] ||
    prefs["unblock-initiator"] ||
    prefs["fix-origin"] ||
    prefs["fake-supported-methods"]
  ) {
    await core["overwrite-origin"]();
  }
  if (prefs.enabled || prefs["allow-credentials"]) {
    await core["allow-credentials"]();
  }
  if (prefs.enabled || prefs["allow-headers"]) {
    await core["allow-headers"]();
  }
  if (prefs.enabled || prefs["remove-referer"]) {
    await core["referer"]();
  }
  if (prefs.enabled || prefs["remove-csp"]) {
    await core["csp"]();
  }
  if (prefs.enabled || prefs["allow-shared-array-buffer"]) {
    await core["allow-shared-array-buffer"]();
  }

  // validate
  if (prefs["allow-credentials"] || prefs["unblock-initiator"]) {
    const prefs = await chrome.storage.local.get({
      "allow-credentials": true,
      "unblock-initiator": true
    });
    if (prefs["allow-credentials"] && prefs["unblock-initiator"] === false) {
      notify(`CORS Unblock Extension

  Conflicting Options:
  The value of the 'Access-Control-Allow-Origin' header must not be '*' when the credentials mode is 'include'

  How to Fix:
  Either disable sending credentials or enable allow origin only for the request initiator`);
    }
  }
});

// action
chrome.action.onClicked.addListener(async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  await chrome.storage.local.set({ enabled: !enabled });
});

/* FAQs & Feedback */
{
  const {
    management,
    runtime: { onInstalled, setUninstallURL, getManifest },
    storage,
    tabs
  } = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const { name, version } = getManifest();
    onInstalled.addListener(({ reason, previousVersion }) => {
      management.getSelf(
        ({ installType }) =>
          installType === "normal" &&
          storage.local.get(
            {
              faqs: true,
              "last-update": 0
            },
            prefs => {
              if (reason === "install" || (prefs.faqs && reason === "update")) {
                const doUpdate =
                  (Date.now() - prefs["last-update"]) / 1000 / 60 / 60 / 24 >
                  45;
                if (doUpdate && previousVersion !== version) {
                  tabs.query({ active: true, currentWindow: true }, tbs =>
                    tabs.create({
                      url:
                        page +
                        "?version=" +
                        version +
                        (previousVersion ? "&p=" + previousVersion : "") +
                        "&type=" +
                        reason,
                      active: reason === "install",
                      ...(tbs && tbs.length && { index: tbs[0].index + 1 })
                    })
                  );
                  storage.local.set({ "last-update": Date.now() });
                }
              }
            }
          )
      );
    });
    setUninstallURL(
      page +
        "?rd=feedback&name=" +
        encodeURIComponent(name) +
        "&version=" +
        version
    );
  }
}
