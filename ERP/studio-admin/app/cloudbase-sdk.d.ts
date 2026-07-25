declare module "@cloudbase/js-sdk/dist/index.cjs.js" {
  const cloudbase: {
    init(config: { env: string }): {
      auth(config: { persistence: string }): {
        getLoginState(): Promise<unknown>;
        signInAnonymously(): Promise<unknown>;
      };
      callFunction(config: {
        name: string;
        data: Record<string, unknown>;
      }): Promise<{ result: unknown }>;
    };
  };
  export default cloudbase;
}
