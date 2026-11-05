export type AuthFormState = {
  ok: false;
  error: { code: string; message: string };
  values?: { name: string; email: string };
  requestId?: string;
};
