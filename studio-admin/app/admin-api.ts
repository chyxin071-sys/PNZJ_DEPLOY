"use client";

const ENV_ID = "cloud1-8grodf5s3006f004";
const FUNCTION_NAME = "pnzjAdminApi";
const LOCAL_LOGIN_DIGEST = "b8725459aea53e97355870aeb0f5624975cc726f1dd28a70020c9e67efcb9d66";
let cachedApp: {
  auth(config: { persistence: string }): {
    getLoginState(): Promise<unknown>;
    signInAnonymously(): Promise<unknown>;
  };
  callFunction(config: {
    name: string;
    data: Record<string, unknown>;
  }): Promise<{ result: unknown }>;
  uploadFile(config: {
    cloudPath: string;
    filePath: File;
  }): Promise<{ fileID: string }>;
  getTempFileURL(config: { fileList: string[] }): Promise<{ fileList: Array<{ fileID: string; tempFileURL: string; status?: number }> }>;
} | null = null;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function localLogin(username: string, password: string) {
  const digest = await sha256(`${username}:${password}:pnzj-admin-preview`);
  if (digest !== LOCAL_LOGIN_DIGEST) {
    throw new Error("账号或密码错误");
  }
  return {
    token: `preview-${Date.now()}`,
    admin: { username, displayName: "测试管理员", role: "超级管理员", mustChangePassword: false },
    mode: "preview" as const,
  };
}

async function getCloudApp() {
  if (cachedApp) return cachedApp;
  const cloudbaseModule = await import("@cloudbase/js-sdk/dist/index.cjs.js");
  const cloudbase = cloudbaseModule.default || cloudbaseModule;
  const app = cloudbase.init({ env: ENV_ID });
  const auth = app.auth({ persistence: "local" });
  const state = await auth.getLoginState();
  if (!state) await auth.signInAnonymously();
  cachedApp = app;
  return app;
}

async function callCloud<T>(
  action: string,
  payload: Record<string, unknown> = {},
  token = "",
) {
  const app = await getCloudApp();
  const response = await app.callFunction({
    name: FUNCTION_NAME,
    data: { action, payload, token },
  });
  const result = response.result as {
    ok: boolean;
    message?: string;
    code?: string;
    data?: T;
  };
  if (!result?.ok) throw new Error(result?.message || "服务调用失败");
  return result.data as T;
}

export const adminApi = {
  envId: ENV_ID,

  async login(username: string, password: string) {
    const isLocalPreview =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");
    const forcePreview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "1";

    if (isLocalPreview && forcePreview) {
      return localLogin(username, password);
    }

    try {
      const data = await callCloud<{
        token: string;
        admin: { username: string; displayName: string; role: string; mustChangePassword?: boolean };
      }>("login", { username, password });
      return { ...data, mode: "cloud" as const };
    } catch (error) {
      throw error;
    }
  },

  listCases(token: string) {
    return callCloud<unknown[]>("listCases", { page: 1, pageSize: 50 }, token);
  },

  listLeads(token: string) {
    return callCloud<unknown[]>("listLeads", { page: 1, pageSize: 50 }, token);
  },

  getAnalytics(token: string) {
    return callCloud<unknown[]>("getAnalytics", { page: 1, pageSize: 1000 }, token);
  },

  listTags(token: string) {
    return callCloud<unknown[]>("listTags", { page: 1, pageSize: 200 }, token);
  },

  saveTag(token: string, data: Record<string, unknown>, id?: string) {
    return callCloud<{ id: string }>("saveTag", { data, id }, token);
  },

  saveCase(token: string, data: Record<string, unknown>, id?: string) {
    return callCloud<{ id: string }>("saveCase", { data, id }, token);
  },

  deleteCase(token: string, id: string) {
    return callCloud<{ deleted: boolean }>("deleteCase", { id }, token);
  },

  async uploadAsset(file: File, folder = "pnzj/cases") {
    const app = await getCloudApp();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const result = await app.uploadFile({
      cloudPath: `${folder}/${Date.now()}-${safeName}`,
      filePath: file,
    });
    const preview = await app.getTempFileURL({ fileList: [result.fileID] });
    return preview.fileList?.[0]?.tempFileURL || result.fileID;
  },

  updateLeadStatus(token: string, id: string, status: string) {
    return callCloud<{ updated: boolean }>(
      "updateLeadStatus",
      { id, status },
      token,
    );
  },

  saveSiteConfig(token: string, data: Record<string, unknown>) {
    return callCloud<{ id: string }>("saveSiteConfig", { data }, token);
  },

  saveWatermarkConfig(token: string, data: Record<string, unknown>) {
    return callCloud<{ id: string }>("saveWatermarkConfig", { data }, token);
  },

  changePassword(token: string, currentPassword: string, nextPassword: string) {
    return callCloud<{ changed: boolean; forceLogout: boolean }>("changePassword", { currentPassword, nextPassword }, token);
  },

  listAdmins(token: string) {
    return callCloud<unknown[]>("listAdmins", {}, token);
  },

  saveAdmin(token: string, data: Record<string, unknown>) {
    return callCloud<{ id: string; forceLogout: boolean }>("saveAdmin", data, token);
  },

  resetAdminPassword(token: string, id: string) {
    return callCloud<{ reset: boolean }>("resetAdminPassword", { id }, token);
  },

  setAdminStatus(token: string, id: string, status: string) {
    return callCloud<{ updated: boolean }>("setAdminStatus", { id, status }, token);
  },

  deleteAdmin(token: string, id: string) {
    return callCloud<{ deleted: boolean }>("deleteAdmin", { id }, token);
  },

};

export type PublicContentPayload = {
  cases: Array<Record<string, unknown>>;
  siteConfig: Record<string, unknown> | null;
  tags: Array<Record<string, unknown>>;
};

export const publicApi = {
  getPublicContent() {
    return callCloud<PublicContentPayload>("getPublicContent");
  },
};
