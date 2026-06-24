import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";

// If process.env.NODE_ENV is production but build files don't exist, Next.js will crash with ENOENT.
// Fallback to development mode dynamically if files aren't physically present on the disk.
const dev = process.env.NODE_ENV !== "production" || !fs.existsSync(path.join(process.cwd(), ".next/routes-manifest.json"));
// The application must run exclusively on port 3000
const port = 3000;
const app = next({ dev, port });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const httpServer = createServer((req, res) => {
      const parsedUrl = parse(req.url || "", true);
      handle(req, res, parsedUrl);
    });

    // Create a WebSocket Server mounted onto the HTTP server
    const wss = new WebSocketServer({ noServer: true });

    // Server-side in-memory shared database state to synchronize tables across players on different devices/browsers
    const db: Record<string, any[]> = {};

    wss.on("connection", (ws: WebSocket) => {
      ws.on("message", (messageData) => {
        try {
          const msg = JSON.parse(messageData.toString());
          const { type, requestId, table, payload, filters, orderField, orderAscending, limitCount, channelName } = msg;

          if (type === "QUERY") {
            const list = db[table] || [];
            let filtered = list.filter((item) => {
              if (!filters) return true;
              return filters.every((f: any) => {
                if (f.type === "eq") return String(item[f.field]) === String(f.value);
                if (f.type === "is") return item[f.field] === f.value;
                return true;
              });
            });

            if (orderField) {
              filtered.sort((a, b) => {
                const valA = a[orderField] ?? "";
                const valB = b[orderField] ?? "";
                if (valA < valB) return orderAscending ? -1 : 1;
                if (valA > valB) return orderAscending ? 1 : -1;
                return 0;
              });
            }

            if (limitCount !== null && limitCount !== undefined) {
              filtered = filtered.slice(0, limitCount);
            }

            ws.send(JSON.stringify({ type: "QUERY_RESULT", requestId, data: filtered }));
          }

          else if (type === "INSERT") {
            if (!db[table]) db[table] = [];
            const list = db[table];
            const newItems = Array.isArray(payload) ? payload : [payload];

            newItems.forEach((item) => {
              if (!item.id) {
                item.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
              }
              if (!item.created_at) {
                item.created_at = new Date().toISOString();
              }
              list.push(item);
            });

            ws.send(JSON.stringify({ type: "WRITE_RESULT", requestId, data: Array.isArray(payload) ? newItems : newItems[0] }));

            // Broadcast INSERT to other clients
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "DB_UPDATE",
                  table,
                  changeType: "insert",
                  data: Array.isArray(payload) ? newItems : newItems[0]
                }));
              }
            });
          }

          else if (type === "UPDATE") {
            if (!db[table]) db[table] = [];
            let list = db[table];
            let lastUpdatedItem: any = null;
            let matchedAny = false;

            list = list.map((item) => {
              const matches = filters ? filters.every((f: any) => {
                if (f.type === 'eq') return String(item[f.field]) === String(f.value);
                if (f.type === 'is') return item[f.field] === f.value;
                return true;
              }) : false;

              if (matches) {
                const updated = { ...item, ...payload };
                lastUpdatedItem = updated;
                matchedAny = true;
                return updated;
              }
              return item;
            });

            if (matchedAny) {
              db[table] = list;
            }

            ws.send(JSON.stringify({ type: "WRITE_RESULT", requestId, data: lastUpdatedItem || payload }));

            if (matchedAny && lastUpdatedItem) {
              // Broadcast UPDATE to other clients
              wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: "DB_UPDATE",
                    table,
                    changeType: "update",
                    data: lastUpdatedItem
                  }));
                }
              });
            }
          }

          else if (type === "UPSERT") {
            if (!db[table]) db[table] = [];
            const list = db[table];
            const itemsToUpsert = Array.isArray(payload) ? payload : [payload];

            itemsToUpsert.forEach((incoming) => {
              const idx = list.findIndex((item) => item.id === incoming.id || (incoming.email && item.email === incoming.email));
              if (idx > -1) {
                list[idx] = { ...list[idx], ...incoming };
              } else {
                if (!incoming.id) incoming.id = Math.random().toString(36).substring(2, 15);
                list.push(incoming);
              }
            });

            ws.send(JSON.stringify({ type: "WRITE_RESULT", requestId, data: Array.isArray(payload) ? itemsToUpsert : itemsToUpsert[0] }));

            // Broadcast UPSERT to other clients
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "DB_UPDATE",
                  table,
                  changeType: "upsert",
                  data: Array.isArray(payload) ? itemsToUpsert : itemsToUpsert[0]
                }));
              }
            });
          }

          else if (type === "BROADCAST_SEND") {
            // Relays realtime pub/sub events (chat, chess moves, timers) to other clients
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "BROADCAST_RECV",
                  channelName,
                  payload
                }));
              }
            });
          }
        } catch (e) {
          console.error("WebSocket message processing failure:", e);
        }
      });
    });

    // Capture HTTP upgrade requests for "/api/ws-sync" route
    httpServer.on("upgrade", (request, socket, head) => {
      const pathname = parse(request.url || "").pathname;
      if (pathname === "/api/ws-sync") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    httpServer
      .once("error", (err) => {
        console.error("Server initialisation error:", err);
        process.exit(1);
      })
      .listen(port, () => {
        console.log(`> Server ready on http://localhost:${port}`);
      });
  })
  .catch((err) => {
    console.error("Next.js prepare failed:", err);
    process.exit(1);
  });

