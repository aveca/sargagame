var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// [[path]].js
async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (url.pathname === "/widget" && url.searchParams.has("token")) {
    let getRegionFromToken = function(token2) {
      try {
        const decoded = atob(token2.replace(/-/g, "+").replace(/_/g, "/"));
        return REGION_MAP[decoded] || "mq";
      } catch {
        return "mq";
      }
    };
    __name(getRegionFromToken, "getRegionFromToken");
    const REGION_MAP = {
      "sargasses-martinique.com": "mq",
      "sargasses-guadeloupe.com": "gp",
      "sargassummiami.com": "florida",
      "sargassumpuntacana.com": "puntacana",
      "sargassumcancun.com": "rivieramaya",
      "sargazotulum.com": "tulum"
    };
    const token = url.searchParams.get("token");
    const region = getRegionFromToken(token);
    try {
      const response = await fetch(`https://sargasses-martinique.com/api/copernicus/sargassum.json`);
      if (!response.ok) {
        return new Response("Donn\xE9es satellite indisponibles", { status: 503 });
      }
      const data = await response.json();
      if (!data?.levels) {
        return new Response("Aucune plage disponible", { status: 503 });
      }
      const lvls = Object.values(data.levels);
      const filtered = lvls.filter((b) => {
        if (region === "gp") return b.id?.startsWith("gp-");
        if (region === "florida") return b.id?.startsWith("fl-");
        if (region === "puntacana") return b.id?.startsWith("pc-");
        if (region === "rivieramaya") return b.id?.startsWith("rm-");
        if (region === "tulum") return b.id?.startsWith("tu-");
        return !b.id?.startsWith("gp-");
      });
      if (!filtered.length) {
        return new Response("Aucune plage disponible", { status: 503 });
      }
      const scored = filtered.map((b) => {
        const days = data.weekly?.[b.id]?.forecast?.map((d) => d.status) || [];
        let score = 100;
        days.forEach((d) => {
          if (d === "avoid") score -= 30;
          else if (d === "moderate") score -= 15;
        });
        return { ...b, score: Math.max(0, score), days };
      });
      scored.sort((a, b) => b.score - a.score);
      const beach = scored[0];
      if (!beach) {
        return new Response("Aucune plage disponible", { status: 503 });
      }
      const fcDays = (data.weekly?.[beach.id]?.forecast || []).slice(0, 3);
      const beachName = beach.name || "Plage";
      const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" };
      const STATUS_LABEL = {
        clean: { fr: "Propre", en: "Clean", es: "Limpia" },
        moderate: { fr: "Mod\xE9r\xE9", en: "Moderate", es: "Moderado" },
        avoid: { fr: "\xC0 \xE9viter", en: "Avoid", es: "Evitar" }
      };
      const DAY_LABEL = [
        { fr: "Auj", en: "Now", es: "Hoy" },
        { fr: "Demain", en: "Tomorrow", es: "Ma\xF1ana" },
        { fr: "J+2", en: "+2d", es: "+2d" }
      ];
      const badges = fcDays.map((d, i) => {
        const color = STATUS_C[d.status] || "#5A5A5A";
        const label = DAY_LABEL[i]?.["fr"] || `J+${i}`;
        const statusLabel = STATUS_LABEL[d.status]?.["fr"] || d.status;
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 14px;border-radius:999px;background:${color};color:white;font:700 11px/1 'Bricolage Grotesque',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.5px;"><span>${label}</span><span style="font-size:10px;opacity:.9">${statusLabel}</span></div>`;
      }).join("");
      const mapSVG = `<svg viewBox="0 0 400 300" style="width:100%;height:100%;display:block;"><defs><linearGradient id="wmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B2230"/><stop offset="0.5" stop-color="#155A5A"/><stop offset="1" stop-color="#C97E3A"/></linearGradient><linearGradient id="wmSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A5852"/><stop offset="1" stop-color="#08251F"/></linearGradient></defs><rect width="400" height="300" fill="url(#wmSky)"/><ellipse cx="200" cy="180" rx="150" ry="100" fill="url(#wmSea)" opacity="0.9"/><ellipse cx="200" cy="180" rx="80" ry="50" fill="#FFC72C" opacity="0.15"/><circle cx="200" cy="180" r="20" fill="#FFC72C" opacity="0.3"/><text x="200" y="185" text-anchor="middle" font-family="'Anton',system-ui,sans-serif" font-size="24" fill="#FFC72C" opacity="0.8">\u{1F3DD}\uFE0F</text></svg>`;
      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SargaGame Widget \u2014 ${beachName}</title>
  <meta http-equiv="refresh" content="21600">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Bricolage Grotesque', system-ui, sans-serif; background: white; min-height: 320px; }
    .widget { width: 100%; height: 320px; border-radius: 12px; overflow: hidden; border: 2px solid #0d7f63; background: white; }
    .map-section { height: 200px; position: relative; background: linear-gradient(135deg, #0a5c4a, #0d7f63); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    .map-section svg { width: 100%; height: 100%; }
    .beach-name { color: white; font: 700 16px/1.2 'Bricolage Grotesque'; text-align: center; text-shadow: 0 2px 8px rgba(0,0,0,0.3); max-width: 90%; }
    .map-label { color: rgba(255,255,255,0.8); font: 500 11px/1 'Bricolage Grotesque'; margin-top: 4px; }
    .badges-section { padding: 12px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .footer { padding: 8px 12px; text-align: center; border-top: 1px solid #eee; background: #fafafa; }
    .footer a { color: #0d7f63; font: 700 11px/1 'Bricolage Grotesque'; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="widget">
    <div class="map-section">
      ${mapSVG}
      <div class="beach-name">${beachName}</div>
      <div class="map-label">Carte interactive \u2014 ${["Martinique", "Guadeloupe", "Florida", "Punta Cana", "Canc\xFAn", "Tulum"][["mq", "gp", "florida", "puntacana", "rivieramaya", "tulum"].indexOf(region)] || "R\xE9gion"}</div>
    </div>
    <div class="badges-section">
      ${badges}
    </div>
    <div class="footer">
      <a href="https://${Object.keys(REGION_MAP).find((k) => REGION_MAP[k] === region) || "sargasses-martinique.com"}/b2b" target="_blank" rel="noopener">
        Powered by SargaGame \u2014 Get this widget \u2192
      </a>
    </div>
  </div>
</body>
</html>`;
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    } catch (err) {
      console.error("Widget error:", err.message);
      return new Response("Erreur interne", { status: 500 });
    }
  }
  if (pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|webp|avif|map|json|webmanifest)$/)) {
    return env.ASSETS.fetch(request);
  }
  if (pathname === "/api/health") {
    return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (pathname.startsWith("/api/")) {
    return env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
  }
  if (pathname.startsWith("/widget")) {
    return env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
  }
  return new Response("<html><body>SPA Fallback OK</body></html>", {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
__name(onRequest, "onRequest");

// ../.wrangler/tmp/pages-HJWrqe/functionsRoutes-0.6181914826265976.mjs
var routes = [
  {
    routePath: "/:path*",
    mountPath: "/",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];

// ../../../../AppData/Roaming/npm/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../AppData/Roaming/npm/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
