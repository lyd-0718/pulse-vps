import type {
  AlertConfig,
  BootstrapResponse,
  HistoryPoint,
  NodeDto,
  NodeUpsertPayload,
  ProbeTargetDto,
  SettingsDto,
} from "../../shared/types";

const TOKEN_KEY = "pulsevps_admin_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

function friendlyStatusError(status: number, serverError?: string): string {
  if (serverError && !/^HTTP \d+/.test(serverError) && !serverError.trim().startsWith("<")) {
    return serverError;
  }
  switch (status) {
    case 400:
      return "提交的参数格式有误，请检查后重试";
    case 401:
      return "登录状态已失效，请重新登录管理员账号";
    case 403:
      return "当前账号无权执行此操作";
    case 404:
      return "目标记录不存在或已被删除";
    case 429:
      return "请求过于频繁，请稍后再试";
    default:
      return status >= 500 ? "服务端暂时不可用，请稍后重试" : `请求失败 (${status})`;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let resp: Response;
  try {
    resp = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("网络连接中断或后端未启动", 0);
  }
  const text = await resp.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }
  if (!resp.ok) {
    const serverErr = (json as { error?: string })?.error;
    throw new ApiError(friendlyStatusError(resp.status, serverErr), resp.status);
  }
  return json as T;
}

export function fetchBootstrap(): Promise<BootstrapResponse> {
  return request<BootstrapResponse>("/api/bootstrap");
}

export async function loginAdmin(password: string): Promise<{ token: string; expiresAt: number }> {
  const res = await request<{ token: string; expiresAt: number }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  setStoredToken(res.token);
  return res;
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; token: string; expiresAt: number }> {
  const res = await request<{ ok: boolean; token: string; expiresAt: number }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export function fetchNodeHistory(
  nodeId: string,
  range: "1h" | "6h" | "24h" | "7d" | "30d",
): Promise<{ nodeId: string; range: string; points: HistoryPoint[] }> {
  return request(`/api/nodes/${encodeURIComponent(nodeId)}/history?range=${range}`);
}

export function createNode(payload: NodeUpsertPayload): Promise<{ node: NodeDto; rawToken: string }> {
  return request("/api/nodes", { method: "POST", body: JSON.stringify(payload) });
}

export function updateNode(id: string, payload: NodeUpsertPayload): Promise<{ node: NodeDto }> {
  return request(`/api/nodes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function rotateNodeToken(id: string): Promise<{ rawToken: string; tokenHint: string }> {
  return request(`/api/nodes/${encodeURIComponent(id)}/rotate-token`, { method: "POST" });
}

export function deleteNode(id: string): Promise<{ ok: boolean }> {
  return request(`/api/nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function createProbe(payload: Partial<ProbeTargetDto>): Promise<{ ok: boolean; id: string }> {
  return request("/api/probes", { method: "POST", body: JSON.stringify(payload) });
}

export function updateProbe(id: string, payload: Partial<ProbeTargetDto>): Promise<{ ok: boolean }> {
  return request(`/api/probes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteProbe(id: string): Promise<{ ok: boolean }> {
  return request(`/api/probes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function runProbesNow(): Promise<{ ok: boolean; checked: number }> {
  return request("/api/probes/run", { method: "POST" });
}

export function updateSettings(payload: Partial<SettingsDto>): Promise<{ settings: SettingsDto }> {
  return request("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
}

export function sendTestAlert(alerts?: AlertConfig): Promise<{ ok: boolean }> {
  return request("/api/alerts/test", {
    method: "POST",
    body: JSON.stringify(alerts ? { alerts } : {}),
  });
}

export function buildWebSocketUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getStoredToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${proto}//${window.location.host}/api/ws${qs}`;
}
