var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { Schema, Service, Universal } from "@satorijs/core";
import { Binary, camelCase, defineProperty, makeArray, sanitize, snakeCase, Time } from "cosmokit";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
var kClient = Symbol("state");
var Client = class {
  static {
    __name(this, "Client");
  }
  authorized = false;
};
var FILTER_HEADERS = [
  "host",
  "authorization",
  "satori-user-id",
  "satori-platform",
  "x-self-id",
  "x-platform"
];
var SatoriServer = class extends Service {
  constructor(ctx, config) {
    super(ctx, "satori.server", true);
    this.config = config;
    const logger = ctx.logger("server");
    const path = sanitize(config.path);
    function checkAuth(koa) {
      if (!config.token) return;
      if (koa.request.headers.authorization !== `Bearer ${config.token}`) {
        koa.body = "invalid token";
        koa.status = 403;
        return true;
      }
    }
    __name(checkAuth, "checkAuth");
    ctx.server.get(path + "/v1/:name", async (koa, next) => {
      const method = Universal.Methods[koa.params.name];
      if (!method) return next();
      koa.body = "Please use POST method to send requests.";
      koa.status = 405;
    });
    ctx.server.post(path + "/v1/:name", async (koa) => {
      const method = Universal.Methods[koa.params.name];
      if (!method) {
        koa.body = "method not found";
        koa.status = 404;
        return;
      }
      if (checkAuth(koa)) return;
      const selfId = koa.request.headers["satori-user-id"] ?? koa.request.headers["x-self-id"];
      const platform = koa.request.headers["satori-platform"] ?? koa.request.headers["x-platform"];
      const bot = ctx.bots.find((bot2) => bot2.selfId === selfId && bot2.platform === platform);
      if (!bot) {
        koa.body = "login not found";
        koa.status = 403;
        return;
      }
      if (method.name === "createUpload") {
        const entries = Object.entries(koa.request.files ?? {}).map(([key, value]) => {
          return [key, makeArray(value)[0]];
        });
        const uploads = await Promise.all(entries.map(async ([, file]) => {
          const buffer2 = await readFile(file.filepath);
          return {
            data: Binary.fromSource(buffer2),
            type: file.mimetype,
            filename: file.newFilename
          };
        }));
        const result2 = await bot.createUpload(...uploads);
        koa.body = Object.fromEntries(entries.map(([key], index) => [key, result2[index]]));
        koa.status = 200;
        return;
      }
      const json = koa.request.body;
      const args = method.fields.map(({ name }) => {
        if (name === "referrer") return json[name];
        return Universal.transformKey(json[name], camelCase);
      });
      const result = await bot[method.name](...args);
      koa.body = Universal.transformKey(result, snakeCase);
      koa.status = 200;
    });
    const marker = defineProperty((_, next) => next(), Symbol.for("noParseBody"), true);
    ctx.server.all(path + "/v1/internal/:path(.+)", marker, async (koa) => {
      const url = new URL(`internal:${koa.params.path}`);
      for (const [key, value] of Object.entries(koa.query)) {
        for (const item of makeArray(value)) {
          url.searchParams.append(key, item);
        }
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(koa.headers)) {
        if (FILTER_HEADERS.includes(key)) continue;
        headers.set(key, value);
      }
      const buffers = [];
      for await (const chunk of koa.req) {
        buffers.push(chunk);
      }
      const body = Binary.fromSource(Buffer.concat(buffers));
      const response = await ctx.satori.handleInternalRoute(koa.method, url, headers, body);
      for (const [key, value] of response.headers ?? new Headers()) {
        koa.set(key, value);
      }
      koa.status = response.status;
      koa.body = response.body ? Buffer.from(response.body) : "";
    });
    ctx.server.get(path + "/v1/proxy/:url(.+)", async (koa) => {
      let url;
      try {
        url = new URL(koa.params.url);
      } catch {
        koa.body = "invalid url";
        koa.status = 400;
        return;
      }
      koa.header["Access-Control-Allow-Origin"] = ctx.server.config.selfUrl || "*";
      const proxyUrls = [...ctx.satori.proxyUrls];
      if (!proxyUrls.some((proxyUrl) => url.href.startsWith(proxyUrl))) {
        koa.body = "forbidden";
        koa.status = 403;
        return;
      }
      try {
        koa.body = Readable.fromWeb(await ctx.http.get(url.href, { responseType: "stream" }));
      } catch (error) {
        if (!ctx.http.isError(error) || !error.response) throw error;
        koa.status = error.response.status;
        koa.body = error.response.data;
        for (const [key, value] of error.response.headers) {
          koa.set(key, value);
        }
      }
    });
    ctx.server.all(path + "/v1/admin/:path(.+)", async (koa) => {
      koa.redirect(`${path}/v1/meta/${koa.params.path}`);
    });
    ctx.server.post(path + "/v1/meta", async (koa) => {
      if (checkAuth(koa)) return;
      koa.body = Universal.transformKey(ctx.satori.toJSON(), snakeCase);
      koa.status = 200;
    });
    ctx.server.post(path + "/v1/meta/webhook.create", async (koa) => {
      if (checkAuth(koa)) return;
      const webhook = Universal.transformKey(koa.request.body, camelCase);
      const index = config.webhooks.findIndex(({ url }) => url === webhook.url);
      if (index === -1) {
        config.webhooks.push(webhook);
        ctx.scope.update(config, false);
      }
      koa.body = {};
      koa.status = 200;
    });
    ctx.server.post(path + "/v1/meta/webhook.delete", async (koa) => {
      if (checkAuth(koa)) return;
      const url = koa.request.body.url;
      const index = config.webhooks.findIndex((webhook) => webhook.url === url);
      if (index !== -1) {
        config.webhooks.splice(index, 1);
        ctx.scope.update(config, false);
      }
      koa.body = {};
      koa.status = 200;
    });
    const buffer = [];
    const timeout = setInterval(() => {
      while (buffer[0]?.timestamp + config.websocket?.resumeTimeout < Date.now()) {
        buffer.shift();
      }
    }, Time.second * 10);
    ctx.on("dispose", () => clearInterval(timeout));
    const layer = ctx.server.ws(path + "/v1/events", (socket) => {
      const client = socket[kClient] = new Client();
      socket.addEventListener("message", (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data.toString());
        } catch (error) {
          return socket.close(4e3, "invalid message");
        }
        if (payload.op === Universal.Opcode.IDENTIFY) {
          if (config.token) {
            if (payload.body?.token !== config.token) {
              return socket.close(4004, "invalid token");
            }
          }
          client.authorized = true;
          socket.send(JSON.stringify({
            op: Universal.Opcode.READY,
            body: Universal.transformKey(ctx.satori.toJSON(), snakeCase)
          }));
          if (!payload.body?.sn) return;
          for (const session of buffer) {
            if (session.id <= payload.body.sn) continue;
            dispatch(socket, Universal.transformKey(session.toJSON(), snakeCase));
          }
        } else if (payload.op === Universal.Opcode.PING) {
          socket.send(JSON.stringify({
            op: Universal.Opcode.PONG,
            body: {}
          }));
        }
      });
    });
    function dispatch(socket, body) {
      socket.send(JSON.stringify({
        op: Universal.Opcode.EVENT,
        body
      }));
    }
    __name(dispatch, "dispatch");
    function sendEvent(opcode, body) {
      for (const socket of layer.clients) {
        if (!socket[kClient]?.authorized) continue;
        dispatch(socket, body);
      }
      for (const webhook of config.webhooks) {
        if (!webhook.enabled) continue;
        ctx.http.post(webhook.url, body, {
          headers: {
            "Satori-Opcode": opcode,
            ...webhook.token ? {
              "Authorization": `Bearer ${webhook.token}`
            } : {}
          }
        }).catch(logger.warn);
      }
    }
    __name(sendEvent, "sendEvent");
    ctx.on("internal/session", (session) => {
      const body = Universal.transformKey(session.toJSON(), snakeCase);
      sendEvent(Universal.Opcode.EVENT, body);
    });
    ctx.on("satori/meta", () => {
      const body = Universal.transformKey(ctx.satori.toJSON(true), snakeCase);
      sendEvent(Universal.Opcode.META, body);
    });
  }
  static {
    __name(this, "SatoriServer");
  }
  static inject = ["server", "http"];
  get url() {
    return (this.ctx.server.config.selfUrl ?? this.ctx.server.selfUrl) + this.config.path;
  }
};
((SatoriServer2) => {
  SatoriServer2.Webhook = Schema.object({
    enabled: Schema.boolean().default(true),
    url: Schema.string(),
    token: Schema.string()
  });
  SatoriServer2.Config = Schema.object({
    path: Schema.string().default("/satori"),
    token: Schema.string().experimental(),
    api: Schema.object({
      // enabled: Schema.boolean().default(true),
    }),
    websocket: Schema.object({
      // enabled: Schema.boolean().default(true),
      resumeTimeout: Schema.number().default(Time.minute * 5)
    }),
    webhooks: Schema.array(SatoriServer2.Webhook)
  });
})(SatoriServer || (SatoriServer = {}));
var src_default = SatoriServer;
export {
  src_default as default
};
