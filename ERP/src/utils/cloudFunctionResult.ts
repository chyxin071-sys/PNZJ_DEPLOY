type CloudFunctionEnvelope<T> = {
  result?: T | string;
  success?: boolean;
};

export function readCloudFunctionResult<T extends object>(response: unknown): T | undefined {
  if (!response || typeof response !== 'object') return undefined;

  const envelope = response as CloudFunctionEnvelope<T>;
  const rawResult = envelope.result ?? (typeof envelope.success === 'boolean' ? response : undefined);

  if (typeof rawResult === 'string') {
    try {
      const parsed = JSON.parse(rawResult);
      return parsed && typeof parsed === 'object' ? parsed as T : undefined;
    } catch {
      return undefined;
    }
  }

  return rawResult && typeof rawResult === 'object' ? rawResult as T : undefined;
}
