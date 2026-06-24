import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Setup cross-tab sync and cross-browser WebSocket synchronization
const isBrowser = typeof window !== "undefined";
const mockBroadcastChannel = isBrowser && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("gml_supabase_mock_sync")
  : null;

if (mockBroadcastChannel) {
  mockBroadcastChannel.onmessage = (event) => {
    const { name, detail } = event.data;
    if (name === "gml_mock_db_update" || name === "gml_mock_broadcast") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  };
}

function mockSyncPost(name: string, detail: any) {
  if (isBrowser && mockBroadcastChannel) {
    mockBroadcastChannel.postMessage({ name, detail });
  }
}

let wsInstance: WebSocket | null = null;
const queryCallbacks: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();

function getWebSocket(): WebSocket | null {
  if (typeof window === "undefined" || !("WebSocket" in window)) return null;
  const WS = window.WebSocket;
  if (wsInstance && (wsInstance.readyState === 1 /* WS.OPEN */ || wsInstance.readyState === 0 /* WS.CONNECTING */)) {
    return wsInstance;
  }

  try {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws-sync`;
    const ws = new WS(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, requestId, table, changeType, data, channelName, payload } = msg;

        if (type === "QUERY_RESULT" || type === "WRITE_RESULT") {
          const callbacks = queryCallbacks.get(requestId);
          if (callbacks) {
            callbacks.resolve({ data, error: null });
            queryCallbacks.delete(requestId);
          }
        } else if (type === "DB_UPDATE") {
          try {
            const key = `gml_mock_table_${table}`;
            const localData = localStorage.getItem(key);
            let localList = localData ? JSON.parse(localData) : [];
            
            if (changeType === "insert") {
              const items = Array.isArray(data) ? data : [data];
              items.forEach((it: any) => {
                if (!localList.some((x: any) => x.id === it.id)) {
                  localList.push(it);
                }
              });
            } else if (changeType === "update") {
              localList = localList.map((it: any) => it.id === data.id ? data : it);
            } else if (changeType === "upsert") {
              const items = Array.isArray(data) ? data : [data];
              items.forEach((it: any) => {
                const idx = localList.findIndex((x: any) => x.id === it.id);
                if (idx > -1) {
                  localList[idx] = it;
                } else {
                  localList.push(it);
                }
              });
            }
            localStorage.setItem(key, JSON.stringify(localList));
          } catch (e) {
            console.error("Local caching sync error:", e);
          }

          // Trigger local event listeners
          const detailObj = { table, type: changeType, data };
          window.dispatchEvent(new CustomEvent('gml_mock_db_update', { 
            detail: detailObj
          }));
        } else if (type === "BROADCAST_RECV") {
          const detailObj = { channelName, payload };
          window.dispatchEvent(new CustomEvent('gml_mock_broadcast', { 
            detail: detailObj
          }));
        }
      } catch (e) {
        console.error("WS onmessage error:", e);
      }
    };

    ws.onclose = () => {
      wsInstance = null;
      setTimeout(getWebSocket, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsInstance = ws;
    return wsInstance;
  } catch (e) {
    console.error("WebSocket setup error:", e);
    return null;
  }
}

// Local Mock Database Engine for Offline/Unconfigured use
class MockQueryChain {
  private table: string;
  private filters: Array<{ type: string; field: string; value: any }> = [];
  private orderField: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private operation: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private payload: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select(fields?: string) {
    this.operation = 'select';
    return this;
  }

  insert(payload: any) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  upsert(payload: any) {
    this.operation = 'upsert';
    this.payload = payload;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ type: 'eq', field, value });
    return this;
  }

  is(field: string, value: any) {
    this.filters.push({ type: 'is', field, value });
    return this;
  }

  order(field: string, options?: { ascending: boolean }) {
    this.orderField = field;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  private getDataList(): any[] {
    if (typeof window === "undefined") return [];
    try {
      const key = `gml_mock_table_${this.table}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to parse mock table storage:", e);
      return [];
    }
  }

  private saveDataList(list: any[]) {
    if (typeof window === "undefined") return;
    try {
      const key = `gml_mock_table_${this.table}`;
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.error("Failed to save mock table storage:", e);
    }
  }

  async executeLocal() {
    let list = this.getDataList();

    if (this.operation === 'insert') {
      const newItems = Array.isArray(this.payload) ? this.payload : [this.payload];
      newItems.forEach(item => {
        if (!item.id) item.id = crypto.randomUUID();
        if (!item.created_at) item.created_at = new Date().toISOString();
        list.push(item);
      });
      this.saveDataList(list);
      
      if (typeof window !== "undefined") {
        const detailObj = { table: this.table, type: 'insert', data: Array.isArray(this.payload) ? newItems : newItems[0] };
        window.dispatchEvent(new CustomEvent('gml_mock_db_update', { 
          detail: detailObj
        }));
        mockSyncPost('gml_mock_db_update', detailObj);
      }

      return { data: Array.isArray(this.payload) ? newItems : newItems[0], error: null };
    }

    if (this.operation === 'update') {
      let lastUpdatedItem: any = null;
      let matchedAny = false;
      list = list.map(item => {
        const matches = this.filters.every(f => {
          if (f.type === 'eq') return String(item[f.field]) === String(f.value);
          if (f.type === 'is') return item[f.field] === f.value;
          return true;
        });
        if (matches) {
          const updated = { ...item, ...this.payload };
          lastUpdatedItem = updated;
          matchedAny = true;
          return updated;
        }
        return item;
      });
      
      if (matchedAny) {
        this.saveDataList(list);
        if (typeof window !== "undefined" && lastUpdatedItem) {
          const detailObj = { table: this.table, type: 'update', data: lastUpdatedItem };
          window.dispatchEvent(new CustomEvent('gml_mock_db_update', { 
            detail: detailObj
          }));
          mockSyncPost('gml_mock_db_update', detailObj);
        }
      }

      return { data: lastUpdatedItem || this.payload, error: null };
    }

    if (this.operation === 'upsert') {
      const itemsToUpsert = Array.isArray(this.payload) ? this.payload : [this.payload];
      itemsToUpsert.forEach(incoming => {
        const idx = list.findIndex(item => item.id === incoming.id || (incoming.email && item.email === incoming.email));
        if (idx > -1) {
          list[idx] = { ...list[idx], ...incoming };
        } else {
          list.push({ id: crypto.randomUUID(), ...incoming });
        }
      });
      this.saveDataList(list);
      return { data: Array.isArray(this.payload) ? itemsToUpsert : itemsToUpsert[0], error: null };
    }

    // SELECT
    let filtered = list.filter(item => {
      return this.filters.every(f => {
        if (f.type === 'eq') return String(item[f.field]) === String(f.value);
        if (f.type === 'is') return item[f.field] === f.value;
        return true;
      });
    });

    if (this.orderField) {
      filtered.sort((a, b) => {
        const valA = a[this.orderField!] ?? "";
        const valB = b[this.orderField!] ?? "";
        if (valA < valB) return this.orderAscending ? -1 : 1;
        if (valA > valB) return this.orderAscending ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== null) {
      filtered = filtered.slice(0, this.limitCount);
    }

    return { data: filtered, error: null };
  }

  async execute() {
    if (typeof window !== "undefined") {
      const ws = getWebSocket();
      if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
        const requestId = Math.random().toString(36).substring(2, 11);
        
        const p = new Promise<{ data: any; error: any }>((resolve) => {
          queryCallbacks.set(requestId, {
            resolve,
            reject: () => resolve(this.executeLocal())
          });
          
          setTimeout(() => {
            if (queryCallbacks.has(requestId)) {
              queryCallbacks.delete(requestId);
              resolve(this.executeLocal());
            }
          }, 2500);
        });

        const formattedFilters = this.filters.map(f => ({ type: f.type, field: f.field, value: f.value }));

        ws.send(JSON.stringify({
          type: this.operation.toUpperCase(),
          requestId,
          table: this.table,
          payload: this.payload,
          filters: formattedFilters,
          orderField: this.orderField,
          orderAscending: this.orderAscending,
          limitCount: this.limitCount
        }));

        const result = await p;
        if (result && result.data && !result.error) {
          // Sync database query into localStorage for instant offline readiness
          try {
            const key = `gml_mock_table_${this.table}`;
            if (this.operation === 'select') {
              const items = Array.isArray(result.data) ? result.data : [result.data];
              localStorage.setItem(key, JSON.stringify(items));
            } else {
              this.executeLocal();
            }
          } catch {}
          return result;
        }
      }
    }

    return this.executeLocal();
  }

  async single() {
    const { data, error } = await this.execute();
    if (error) return { data: null, error };
    const arr = Array.isArray(data) ? data : [data];
    if (arr.length === 0) {
      return { data: null, error: { message: "JSON object requested but zero results returned." } };
    }
    return { data: arr[0], error: null };
  }

  async maybeSingle() {
    const { data, error } = await this.execute();
    if (error) return { data: null, error };
    const arr = Array.isArray(data) ? data : [data];
    return { data: arr.length > 0 ? arr[0] : null, error: null };
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class MockChannel {
  private listeners: Array<{
    event: string;
    config: any;
    callback: (payload: any) => void;
  }> = [];

  constructor(public name: string) {}

  on(event: string, config: any, callback: (payload: any) => void) {
    this.listeners.push({ event, config, callback });
    return this;
  }

  send(payload: any) {
    if (typeof window !== "undefined") {
      const detailObj = { channelName: this.name, payload };
      window.dispatchEvent(new CustomEvent('gml_mock_broadcast', {
        detail: detailObj
      }));
      mockSyncPost('gml_mock_broadcast', detailObj);

      const ws = getWebSocket();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "BROADCAST_SEND",
          channelName: this.name,
          payload
        }));
      }
    }
    return Promise.resolve("ok");
  }

  subscribe(callback?: (status: string) => void) {
    if (typeof window === "undefined") return this;

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { table, type, data } = customEvent.detail || {};

      this.listeners.forEach(listener => {
        if (listener.config?.table && listener.config.table !== table) return;
        
        if (listener.event === "postgres_changes") {
          const expectedEvent = listener.config?.event;
          if (expectedEvent && expectedEvent !== "*" && expectedEvent !== type.toUpperCase()) return;
          
          const filter = listener.config?.filter;
          if (filter) {
            const match = filter.match(/^([\w_]+)=eq\.(.+)$/);
            if (match) {
              const [_, field, val] = match;
              if (String(data[field]) !== String(val)) return;
            }
          }

          const payload = {
            schema: "public",
            table,
            commit_timestamp: new Date().toISOString(),
            eventType: type.toUpperCase(),
            new: data,
            old: type === 'update' ? {} : null
          };

          listener.callback(payload);
        }
      });
    };

    const handleBroadcast = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { channelName, payload } = customEvent.detail || {};
      if (channelName !== this.name) return;
      
      this.listeners.forEach(listener => {
        if (listener.event === "broadcast" && listener.config?.event === payload.event) {
          listener.callback(payload);
        }
      });
    };

    (this as any)._windowListener = handleUpdate;
    (this as any)._windowBroadcastListener = handleBroadcast;
    
    window.addEventListener('gml_mock_db_update', handleUpdate);
    window.addEventListener('gml_mock_broadcast', handleBroadcast);

    if (callback) {
      setTimeout(() => callback("SUBSCRIBED"), 10);
    }
    return this;
  }

  unsubscribe() {
    if (typeof window !== "undefined") {
      if ((this as any)._windowListener) {
        window.removeEventListener('gml_mock_db_update', (this as any)._windowListener);
      }
      if ((this as any)._windowBroadcastListener) {
        window.removeEventListener('gml_mock_broadcast', (this as any)._windowBroadcastListener);
      }
    }
  }
}

function createMockSupabase(): any {
  return {
    auth: {
      signUp: async ({ email, password, options }: any) => {
        const id = crypto.randomUUID();
        const user = { id, email, user_metadata: options?.data || {} };
        const users = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("gml_mock_users") || "[]") : [];
        users.push({ id, email, password, metadata: options?.data || {} });
        if (typeof window !== "undefined") {
          localStorage.setItem("gml_mock_users", JSON.stringify(users));
          localStorage.setItem("gml_user", JSON.stringify({ username: options?.data?.username || email.split('@')[0], email }));
          window.dispatchEvent(new Event("gml_auth_change"));
        }
        return { data: { user }, error: null };
      },
      signInWithPassword: async ({ email, password }: any) => {
        const users = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("gml_mock_users") || "[]") : [];
        const user = users.find((u: any) => u.email === email && u.password === password);
        if (!user) {
          return { data: { user: null }, error: { message: "Invalid credentials specified or user account not found locally." } };
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("gml_user", JSON.stringify({ username: user.metadata?.username || email.split('@')[0], email }));
          window.dispatchEvent(new Event("gml_auth_change"));
        }
        return { data: { user: { id: user.id, email, user_metadata: user.metadata } }, error: null };
      },
      signOut: async () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("gml_user");
          window.dispatchEvent(new Event("gml_auth_change"));
        }
        return { error: null };
      }
    },
    from: (table: string) => {
      return new MockQueryChain(table);
    },
    channel: (name: string) => {
      return new MockChannel(name);
    },
    removeChannel: (channel: any) => {
      if (channel && typeof channel.unsubscribe === 'function') {
        channel.unsubscribe();
      }
    }
  };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const isMock = !supabaseUrl || !supabaseAnonKey || 
                   supabaseUrl.includes("placeholder-url") || 
                   supabaseAnonKey.includes("placeholder-anon-key");

    if (isMock) {
      console.warn('Supabase credentials are not fully configured in environment variables. Falling back to an offline local storage mockup client.');
      supabaseInstance = createMockSupabase() as unknown as SupabaseClient;
      if (typeof window !== "undefined") {
        getWebSocket();
      }
    } else {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    }
  }
  return supabaseInstance;
}
