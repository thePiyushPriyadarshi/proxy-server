import { config } from "node:process";
import cluster, { Worker } from "node:cluster";
import http from "node:http";
import { ConfigSchemaType, rootConfigSchema } from "./config-schema";
import {
  workerMessageReplySchema,
  WorkerMessageReplyType,
  workerMessageSchema,
  WorkerMessageType,
} from "./server-schema";

interface CreateServerConfig {
  port: number;
  workerCount: number;
  config: ConfigSchemaType;
}
export async function createServer(config: CreateServerConfig) {
  const { port, workerCount } = config;
  const WORKER_POOL: Worker[] = [];

  if (cluster.isPrimary) {
    for (let i = 0; i < workerCount; i++) {
      const w = cluster.fork({ config: JSON.stringify(config.config) });
      WORKER_POOL.push(w);
      console.log(`Master Process : Worket Node Spinned ${i}`);
    }

    const server = http.createServer(function (req, res) {
      const index = Math.floor(Math.random() * WORKER_POOL.length);
      const worker = WORKER_POOL.at(index);
      if (!worker) {
        throw new Error("Worker not found");
      }
      const payload: WorkerMessageType = {
        requestType: "HTTP",
        headers: req.headers,
        body: null,
        url: req.url as string,
      };
      worker.send(JSON.stringify(payload));

      worker.on("message",async(workerReply : string)=>{
        const reply = await workerMessageReplySchema.parseAsync(JSON.parse(workerReply))
        if(reply.errorCode){
          res.writeHead(reply.errorCode);
          res.end(reply.error);
          return;
        }
        else{
          res.writeHead(200);
          res.end(reply.data);
          return;
        }
      })
    });

    server.listen(port, function () {
      console.log(`Reverse Proxy Server listening on ${port}`);
    });
  } else {
    console.log("Worker Node 🚀");
    const config = await rootConfigSchema.parseAsync(
      JSON.parse(process.env.config as string)
    );
    process.on("message", async (message: string) => {
      const messageValidated = await workerMessageSchema.parseAsync(
        JSON.parse(message)
      );

      const requestURL = messageValidated.url;
      const rule = config.server.rules.find((e) => {
        const regex = new RegExp(`^${e.path}.*$`);
        return regex.test(requestURL);
      });

      if (!rule) {
        const reply: WorkerMessageReplyType = {
          errorCode: 404,
          error: `Rule not found`,
        };
        if (process.send) return process.send(JSON.stringify(reply));
      }
      const upstreamId = rule?.upstreams[0];
      const upsteam = config.server.upstreams.find((e) => e.id === upstreamId);

      if (!upsteam) {
        const reply: WorkerMessageReplyType = {
          errorCode: 500,
          error: `Upstream not found`,
        };
        if (process.send) return process.send(JSON.stringify(reply));
      }

      const request = http.request({ host: upsteam?.url, path: requestURL }, (proxyRes) => {
        let body = "";
        proxyRes.on("data", (chunk) => {
          body += chunk;
        });

        proxyRes.on("end", () => {
          const reply: WorkerMessageReplyType = {
            data: body,
          };
          if (process.send) return process.send(JSON.stringify(reply));
        });
      });
      request.end();
    });
  }
}
