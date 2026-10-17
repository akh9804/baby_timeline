import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAuthenticatedTestApp as buildApp } from '../test-app.js';

test('admin can create a child and timeline moment, while viewers can read it', async (t) => {
  const app = await buildApp({ databasePath: ':memory:' });
  t.after(() => app.close());

  const childResponse = await app.inject({
    method: 'POST',
    url: '/children',
    payload: { name: '아기', dueDate: '2026-12-24' },
  });
  assert.equal(childResponse.statusCode, 201);
  assert.equal(childResponse.json().name, '아기');

  const momentResponse = await app.inject({
    method: 'POST',
    url: '/moments',
    payload: {
      childId: childResponse.json().id,
      title: '첫 초음파',
      description: '작은 심장 소리를 들은 날',
      occurredAt: '2026-10-05T10:00:00+09:00',
    },
  });
  assert.equal(momentResponse.statusCode, 201);

  const timelineResponse = await app.inject({ method: 'GET', url: '/timeline' });
  assert.equal(timelineResponse.statusCode, 200);
  assert.deepEqual(timelineResponse.json().child, {
    id: 1,
    name: '아기',
    dueDate: '2026-12-24',
    birthDate: null,
  });
  assert.equal(timelineResponse.json().moments[0].title, '첫 초음파');
  assert.deepEqual(timelineResponse.json().moments[0].media, []);
  assert.deepEqual(timelineResponse.json().moments[0].comments, []);

  const momentId = momentResponse.json().id;
  const commentResponse = await app.inject({
    method: 'POST',
    url: `/moments/${momentId}/comments`,
    payload: { author: '엄마', content: '정말 소중한 날이었어.' },
  });
  assert.equal(commentResponse.statusCode, 201);
  const commentId = commentResponse.json().id;

  const updateCommentResponse = await app.inject({
    method: 'PATCH',
    url: `/comments/${commentId}`,
    payload: { author: '아빠', content: '우리 모두 기억하는 날이야.' },
  });
  assert.equal(updateCommentResponse.statusCode, 200);
  assert.equal(updateCommentResponse.json().author, '아빠');

  const deleteCommentResponse = await app.inject({ method: 'DELETE', url: `/comments/${commentId}` });
  assert.equal(deleteCommentResponse.statusCode, 204);

  const secondChild = await app.inject({
    method: 'POST',
    url: '/children',
    payload: { name: '둘째' },
  });
  assert.equal(secondChild.statusCode, 201);
  const children = await app.inject({ method: 'GET', url: '/children' });
  assert.deepEqual(
    children.json().map((child: { name: string }) => child.name),
    ['아기', '둘째'],
  );
  const secondTimeline = await app.inject({
    method: 'GET',
    url: `/timeline?childId=${secondChild.json().id}`,
  });
  assert.deepEqual(secondTimeline.json().moments, []);
});

test('viewers cannot change child or timeline records', async (t) => {
  const viewerApp = await import('../app.js').then(({ buildApp }) =>
    buildApp({
      databasePath: ':memory:',
      authentication: {
        accounts: [{ id: 'viewer', password: 'viewer-password', role: 'viewer' }],
        cookieSecret: 'test-cookie-secret-that-is-long-enough',
        secureCookies: false,
      },
    }),
  );
  t.after(() => viewerApp.close());

  const login = await viewerApp.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { password: 'viewer-password' },
  });
  const cookie = String(login.headers['set-cookie']).split(';', 1)[0];

  const response = await viewerApp.inject({
    method: 'POST',
    url: '/children',
    headers: { cookie },
    payload: { name: '아기' },
  });
  assert.equal(response.statusCode, 403);
});
