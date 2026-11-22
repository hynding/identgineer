import type { Clock } from "../clock.ts";

export interface FakeUser {
  readonly id: number;
  readonly documentId: string;
  username: string;
  email: string;
  password: string | null;
  provider: string;
  confirmed: boolean;
  blocked: boolean;
  readonly createdAt: string;
  resetCode?: string;
  confirmationCode?: string;
}

interface FakeSession {
  readonly sessionId: string;
  readonly userId: number;
  readonly secret: string;
  readonly deviceId: string | null;
  readonly deviceName: string | null;
  readonly loginAt: string;
  readonly createdAt: string;
  status: "active" | "rotated";
}

interface FakeAccessToken {
  readonly userId: number;
  sessionId: string | null;
  readonly expiresAt: number;
}

export interface FakeProfile {
  readonly id: number;
  readonly documentId: string;
  readonly ownerId: number;
  values: Record<string, unknown>;
}

export interface IssuedTokens {
  readonly jwt: string;
  readonly refreshToken: string;
}

export interface FakeStoreOptions {
  readonly clock: Clock;
  readonly accessTokens: "jwt" | "opaque";
  readonly accessTokenLifetimeSeconds: number;
}

const base64Url = (value: string): string =>
  btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

/** The fake API's accounts, sessions, tokens and profiles, with users-permissions' rules. */
export const createFakeStore = (options: FakeStoreOptions) => {
  const { clock } = options;
  let serial = 0;
  const next = (): number => ++serial;
  const users = new Map<number, FakeUser>();
  const sessions = new Map<string, FakeSession>();
  const accessTokens = new Map<string, FakeAccessToken>();
  const profiles = new Map<number, FakeProfile>();
  const stamp = (): string => new Date(clock.now()).toISOString();

  const issueAccessToken = (userId: number, sessionId: string | null): string => {
    const n = next();
    const expiresAt = clock.now() + options.accessTokenLifetimeSeconds * 1000;
    const token =
      options.accessTokens === "jwt"
        ? `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url(
            JSON.stringify({
              id: userId,
              n,
              iat: Math.floor(clock.now() / 1000),
              exp: Math.floor(expiresAt / 1000),
            }),
          )}.fake-signature-${String(n)}`
        : `${String(n)}|fakeOpaqueToken${String(n).padStart(32, "0")}`;
    accessTokens.set(token, { userId, sessionId, expiresAt });
    return token;
  };

  const openSession = (
    userId: number,
    deviceId: string | null,
    deviceName: string | null,
  ): IssuedTokens => {
    const sessionId = next().toString(16).padStart(32, "0");
    const secret = `secret${String(next())}`;
    sessions.set(sessionId, {
      sessionId,
      userId,
      secret,
      deviceId,
      deviceName,
      loginAt: stamp(),
      createdAt: stamp(),
      status: "active",
    });
    return { jwt: issueAccessToken(userId, sessionId), refreshToken: `${sessionId}.${secret}` };
  };

  const usableSession = (refreshToken: string): FakeSession | undefined => {
    const [sessionId = "", secret = ""] = refreshToken.split(".", 2);
    const session = sessions.get(sessionId);
    return session?.status === "active" && session.secret === secret ? session : undefined;
  };

  const endSessions = (ids: readonly string[]): void => {
    for (const [token, record] of accessTokens) {
      if (record.sessionId !== null && ids.includes(record.sessionId)) accessTokens.delete(token);
    }
    for (const id of ids) sessions.delete(id);
  };

  const sessionsOf = (userId: number): FakeSession[] =>
    [...sessions.values()].filter((session) => session.userId === userId);

  return {
    users,
    profiles,
    next,
    stamp,
    addUser: (values: Omit<FakeUser, "id" | "documentId" | "createdAt">): FakeUser => {
      const id = next();
      const user: FakeUser = { ...values, id, documentId: `user${String(id)}`, createdAt: stamp() };
      users.set(id, user);
      return user;
    },
    findUser: (predicate: (user: FakeUser) => boolean): FakeUser | undefined =>
      [...users.values()].find(predicate),
    wire: (user: FakeUser) => ({
      id: user.id,
      documentId: user.documentId,
      username: user.username,
      email: user.email,
      provider: user.provider,
      confirmed: user.confirmed,
      blocked: user.blocked,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
      publishedAt: user.createdAt,
    }),
    lastingToken: (userId: number): string => issueAccessToken(userId, null),
    openSession,
    /** The access token's record while it is unexpired. */
    verifyAccessToken: (token: string): (FakeAccessToken & { token: string }) | undefined => {
      const record = accessTokens.get(token);
      return record !== undefined && record.expiresAt > clock.now()
        ? { ...record, token }
        : undefined;
    },
    rotate: (refreshToken: string): IssuedTokens | undefined => {
      const current = usableSession(refreshToken);
      if (current === undefined) return undefined;
      current.status = "rotated";
      const successor = openSession(current.userId, current.deviceId, current.deviceName);
      const successorId = successor.refreshToken.split(".")[0] ?? "";
      for (const record of accessTokens.values()) {
        if (record.sessionId === current.sessionId) record.sessionId = successorId;
      }
      return successor;
    },
    sessionExists: (sessionId: string): boolean => sessions.has(sessionId),
    sessionOf: (refreshToken: string | undefined): string | undefined =>
      refreshToken === undefined ? undefined : usableSession(refreshToken)?.sessionId,
    activeSessions: (userId: number) =>
      sessionsOf(userId).filter((session) => session.status === "active"),
    revoke: (userId: number, sessionId: string): boolean => {
      const session = sessions.get(sessionId);
      if (session?.userId !== userId) return false;
      endSessions([sessionId]);
      return true;
    },
    invalidate: (userId: number, deviceId?: string): void => {
      endSessions(
        sessionsOf(userId)
          .filter((session) => deviceId === undefined || session.deviceId === deviceId)
          .map((session) => session.sessionId),
      );
    },
    dropLastingTokens: (userId: number): void => {
      for (const [token, record] of accessTokens) {
        if (record.userId === userId && record.sessionId === null) accessTokens.delete(token);
      }
    },
    expireAccessTokens: (): void => {
      accessTokens.clear();
    },
  };
};

export type FakeStore = ReturnType<typeof createFakeStore>;
