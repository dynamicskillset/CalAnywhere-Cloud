import { requireAuth } from '../auth/middleware';
import * as sessionModule from '../auth/session';

jest.mock('../auth/session');

const mockValidateSession = sessionModule.validateSession as jest.MockedFunction<typeof sessionModule.validateSession>;

function makeReqRes(cookie?: string) {
  const req: any = { cookies: cookie ? { ca_session: cookie } : {} };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireAuth middleware', () => {
  it('returns 401 when no session cookie is present', async () => {
    const pool: any = {};
    const { req, res, next } = makeReqRes();

    await requireAuth(pool)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the session is invalid or expired', async () => {
    mockValidateSession.mockResolvedValue(null);
    const pool: any = {};
    const { req, res, next } = makeReqRes('expiredtoken');

    await requireAuth(pool)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expired' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches session to req and calls next() for a valid session', async () => {
    const session = { userId: 'user-1', emojiId: '🐶🍕🚀', tier: 'free' };
    mockValidateSession.mockResolvedValue(session);
    const pool: any = {};
    const { req, res, next } = makeReqRes('validtoken');

    await requireAuth(pool)(req, res, next);

    expect(req.session).toEqual(session);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
